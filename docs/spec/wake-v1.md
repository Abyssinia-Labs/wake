# wake/v1

Status: stable, 2026-10-09. The protocol between an app and Wake, the
listener on a person's machine that starts their coding agent when the app
hands it work. This document is what an app implements; Wake implements the
other side. The words MUST, MUST NOT, SHOULD and MAY are as in RFC 2119.

An app built on Convex can take the server half whole from
[`@abyssinia-labs/wake-convex`](../../packages/convex), and
`wakectl check <domain>` tests an app against this document.

## Terms

- **App**: a product where people hand work to agents (a tracker, a doc
  editor). It serves this protocol.
- **Agent**: an identity in the app that a coding tool (Claude Code, Codex,
  Cursor) acts as. Every agent belongs to one **person**, its owner.
- **Place**: somewhere an agent can be started. Here, Wake on one machine,
  paired to one agent.
- **Summons**: the app's record that an agent was asked to do something.
  It names what, never says it.
- **Place key**: the long-lived secret a place presents. **Pair code**: the
  short, single-use secret traded for one.

## Principles

1. **A summons carries no text.** What asked the agent (a comment, a
   ticket) is untrusted input. The agent reads it over its own connection
   to the app, with its own access checked at that moment.
2. **A summons is a row, and pulling it is the truth.** Wake subscribes to
   what is pending; nothing is pushed to the machine.
3. **Places race to claim.** Every place of the agent sees a summons; the
   first claim wins, and the rest let it go.
4. **The owner decides what runs unattended.** A summons made by anyone
   other than the agent's owner MUST wait for the owner's yes before any
   place can see it.

## Discovery

`GET https://<domain>/.well-known/wake` MUST answer `200` with:

```json
{ "version": "wake/v1", "convexUrl": "https://….convex.cloud", "httpBase": "https://…" }
```

- `convexUrl` is the Convex deployment Wake subscribes to; `httpBase` is
  where the two HTTP routes live (often the deployment's `.convex.site`
  address or the app's own API host).
- Both MUST be `https:` URLs without credentials. `http:` is allowed only
  for `localhost`, `127.0.0.1` and `[::1]`, for development.
- The route MUST NOT redirect: Wake refuses redirects on every route.
- A future version changes `version`; Wake refuses one it does not speak.

## Pairing

### The code

The agent asks the app for a pair code over its own authenticated
connection (an MCP tool or an API call; how is the app's). The app MUST:

- bind the code to the calling agent, and to the program that asked
  (`claude`, `codex` or `cursor`) when the app can tell;
- make it single-use and valid for at most ten minutes;
- give it at least 39 bits of entropy (eight characters from a 30-letter
  alphabet, shown as `K7QD-2M9X`), and accept it in any case, with or
  without the dash;
- store only a hash of it;
- answer with the command the person runs: `wakectl pair <domain> <code>`.

### `POST {httpBase}/wake/v1/pair`

Request, JSON:

```json
{ "code": "K7QD-2M9X", "machine": { "name": "Ada's MacBook", "platform": "darwin" } }
```

`200`, JSON:

```json
{
  "placeKey": "gwk_…",
  "app": "gatherd",
  "agent": { "id": "j974w1ceam6q…", "name": "Claude", "tool": "claude" }
}
```

| Field | Rule |
| --- | --- |
| `placeKey` | 16 to 512 printable ASCII characters (`!` to `~`), at least 128 bits of entropy; 256 recommended. An app prefix (`gwk_`) is allowed. Shown once. |
| `app` | The app's name: `^[a-z0-9][a-z0-9-]{0,39}$`. Wake uses it as a folder name and as the name of the app's MCP server in the agent. |
| `agent.id` | `^[A-Za-z0-9_-]{1,128}$`. |
| `agent.name` | 1 to 64 characters, no control or format characters. |
| `agent.tool` | Optional: `claude`, `codex` or `cursor`, the program that asked for the code. |

Errors, each `{ "error": <code>, "message": <words for a person> }`:

| Status | `error` | When |
| --- | --- | --- |
| `400` | `invalid_body` | The body is not the shape above. |
| `400` | `code_invalid` | The code is wrong, used or expired. |
| `403` | `agent_unavailable` | The agent that asked for the code can no longer pair (revoked, removed). |

The app MUST store the place key only as its SHA-256 hash, in lower-case
hex, and MUST make the key in a runtime with real randomness (an HTTP
action or an action, not a deterministic query or mutation).

### `POST {httpBase}/wake/v1/forget`

The place key as `Authorization: Bearer <placeKey>`, no body. `204` when
the place is forgotten; `401` with `error: "unpaired"` when the key opened
nothing already. After it, the key MUST open nothing.

## The three functions

Public Convex functions on `convexUrl`'s deployment, called by name, each
with the place key as its `key` argument. Each MUST find the place by the
key's SHA-256 hash, and MUST throw `ConvexError("UNPAIRED")` when the key
was never issued, its place was forgotten, or its agent was revoked. They
answer for that place's agent only. Nobody signs in: the key is the whole
credential, and it MUST open these three and nothing else.

### `wake:pending` (query)

`{ key }` → an array of the agent's open summonses, oldest first, at most
50. A summons:

```json
{
  "id": "pd77ydnv…",
  "app": "gatherd",
  "kind": "assigned",
  "target": { "kind": "ticket", "ref": "GAT-70", "url": "https://gatherd.dev/w/acme/t/GAT-70" },
  "repo": "acme/widgets",
  "branch": "gat-70-fix-the-thing",
  "at": 1791421810141
}
```

| Field | Rule |
| --- | --- |
| `id` | `^[A-Za-z0-9_-]{1,128}$`. |
| `app` | As in the pairing answer. |
| `kind` | Why it was made: `^[a-z][a-z_-]{0,31}$` (`assigned`, `mentioned`). |
| `target.kind` | What it is about, same shape (`ticket`, `page`). |
| `target.ref` | How a person names it: 1 to 64 characters, no control or format characters (`GAT-70`, a page's title). |
| `target.url` | Where it is, `https:` (or local `http:`), at most 2048 characters. |
| `repo`, `branch` | Together or not at all. `repo` is a GitHub `owner/name`; `branch` matches `^[A-Za-z0-9][A-Za-z0-9._/-]*$`, at most 200 characters, with no `..` or `//`, not ending in `/` or `.lock`. A summons with a repository runs on that branch; the app MUST NOT name the repository's default branch. |
| `at` | When it was made, in milliseconds. |

An app MAY add fields; Wake ignores what it does not know. Wake skips a
summons that breaks a rule above and says so in its log.

### `wake:claim` (mutation)

`{ key, id }` → `{ "claimed": true, "run": { "prompt": "…" } }` for the
first claim of an open summons by a place of its agent, and
`{ "claimed": false }` for every other call, including an id that does not
exist or is not this agent's. A winning claim moves the summons to
claimed and records the place.

`run.prompt` is the app's instructions to the agent: which tools to call to
read the summons and how to finish it. At most 64 KiB. It MUST NOT include
the text that asked (principle 1). The app writes it, so a change of tools
needs no new Wake.

### `wake:finish` (mutation)

`{ key, id, outcome: "done" | "failed", reason? }` → `null`. Only the
place that claimed the summons can finish it; any other call does nothing.
`reason`, at most 300 characters, is shown to people where the summons was
made. Wake sends one only when it was written to be shared, never paths or
command output.

## A summons's life

```
asking ──owner says yes──▶ open ──claim──▶ claimed ──finish──▶ done | failed
   └────────┬─────────────────┘
            └──no longer wanted──▶ dropped
```

- **asking**: made by someone other than the agent's owner; invisible to
  places until the owner says yes. A summons made by the owner starts open.
- **open**: listed by `wake:pending`. If nothing claims it within thirty
  minutes, the app SHOULD tell the asker where it was made. It stays open:
  a machine that wakes later still claims it.
- **dropped**: no longer wanted (unassigned, closed, answered from a live
  session) while asking or open. A claimed summons is its run's to end.
- One live summons (asking, open or claimed) per agent per target; a
  second ask joins the first.
- Only a person's action makes a summons. An agent's own write never does,
  so no agent wakes another.

## What Wake does with a run

So an app knows what its summons leads to: Wake runs only for an app the
person paired, only in repositories the person approved for that app on
that machine, never on the default branch, in a fresh worktree, with the
agent's shell sandboxed, and never with permission checks bypassed. The
README's Security section has the detail.

## Versions

A new field is additive and stays `wake/v1`. Anything else (a field's
meaning, a rule, a route) is `wake/v2`, announced in discovery's `version`;
an app serves both until Wake's installed versions have moved.
