# wake/v1

Status: stable, 2026-10-09; devices that watch added 2026-10-23. The
protocol between an app and Wake, the listener on a person's machine that
starts their coding agent when the app hands it work. This document is what
an app implements; Wake implements the other side. The words MUST, MUST
NOT, SHOULD and MAY are as in RFC 2119.

An app built on Convex can take the server half whole from
[`@abyssinia-labs/wake-convex`](../../packages/convex); any other app serves
the same protocol over plain HTTP ([The HTTP transport](#the-http-transport)).
`wakectl check <domain>` tests an app against this document.

[Devices that watch](#devices-that-watch) and `wake:waiting` are new. Both
packages serve them and `wakectl check` probes them; Wake calls
`wake:waiting` from its next release.

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
- **Device**: something the owner reads their agent's summonses on and
  answers asks from (a phone, a browser, a desktop app). It never claims a
  summons and never starts anything: a device is not a place.
- **Watch key**: the long-lived secret a device presents. **Watch code**:
  the short, single-use secret traded for one, made only in the app's own
  interface for its signed-in owner.

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
   place can see it. The yes comes from the owner signed in to the app, or
   from a device they added there; never from anything a run can reach.
5. **A place runs; a device watches.** A place key opens only the place
   calls, and a watch key only the watch calls. No agent token, place key
   or call of this protocol makes a watch code, so a run, which can reach
   the first two, can never give itself the owner's yes.

## Discovery

`GET https://<domain>/.well-known/wake` MUST answer `200` with one of:

```json
{ "version": "wake/v1", "convexUrl": "https://….convex.cloud", "httpBase": "https://…" }
```

```json
{ "version": "wake/v1", "transport": "http", "httpBase": "https://…" }
```

- `transport` is how Wake reaches the summonses: `convex` (the functions
  below, on `convexUrl`) or `http` ([The HTTP transport](#the-http-transport),
  under `httpBase`). Absent means `convex`. Wake refuses a transport it
  does not speak, and says to update Wake.
- `convexUrl` is the Convex deployment Wake subscribes to, required for
  `convex` and left out for `http`; `httpBase` is where the HTTP routes
  live (often the deployment's `.convex.site` address or the app's own API
  host).
- Each MUST be an `https:` URL without credentials. `http:` is allowed only
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
nothing already. After it, the key MUST open nothing. A device forgets its
watch key the same way ([Devices that watch](#devices-that-watch)).

## The functions

For the `convex` transport: public Convex functions on `convexUrl`'s deployment, called by name, each
with the place key as its `key` argument. Each MUST find the place by the
key's SHA-256 hash, and MUST throw `ConvexError("UNPAIRED")` when the key
was never issued, its place was forgotten, or its agent was revoked. They
answer for that place's agent only. Nobody signs in: the key is the whole
credential, and it MUST open these and nothing else.

An app MUST serve `wake:pending`, `wake:claim` and `wake:finish`. It MAY
serve `wake:started` and `wake:waiting`; Wake does without them.

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

### `wake:started` (mutation, optional)

`{ key, id, run: { name, tool, session? } }` → `null`. Wake calls it when
the agent it started for a claimed summons is running, so the app can show
that the agent is on it without the agent writing a comment. It may call it
again for the same run when it learns the session id later (Codex and
Cursor choose their own); a later call replaces what an earlier one said.
Only the place that claimed the summons can call it, and only while it is
claimed; any other call does nothing.

| Field | Rule |
| --- | --- |
| `run.name` | The run's name for people, the same on the app, in the agent's terminal tab and in Wake's log: two words from a fixed list, joined by a dash (`amber-heron`); `^[a-z]{1,16}-[a-z]{1,16}$`. |
| `run.tool` | The tool running it: `claude`, `codex` or `cursor`. |
| `run.session` | The tool's session id, `^[A-Za-z0-9_-]{1,128}$`, when Wake knows it. It is how the agent's owner resumes the run on their machine; the app SHOULD show it to the owner only. |

When the deployment has no `wake:started`, Wake asks the agent to say it
is on it in a comment instead, as it did before the function existed.

### `wake:waiting` (mutation, optional)

`{ key, id, waiting }` → `null`. Wake calls it with `waiting: true` when
the run of a summons it claimed stops on a question for its owner, and with
`false` when the run goes on. It says nothing of the question, which stays
on the machine. Only the place that claimed the summons can call it, and
only while it is claimed; any other call does nothing. The owner's devices
see it in `wake:runs`. When the deployment has no `wake:waiting`, Wake does
without it.

## The HTTP transport

For an app whose discovery says `transport: "http"`: the same calls as the
functions, as routes under `httpBase`, with the same arguments and
answers. Each takes the place key as `Authorization: Bearer <placeKey>`,
finds the place by its hash as the functions do, and answers `401` with
`error: "unpaired"` where a function throws `UNPAIRED`. Bodies are JSON;
no route redirects. A body of the wrong shape is `400` with
`error: "invalid_body"`.

### `GET {httpBase}/wake/v1/pending`

With `Accept: text/event-stream`, a stream of
[server-sent events](https://html.spec.whatwg.org/multipage/server-sent-events.html):

```
event: pending
data: [{"id":"pd77…","app":"acme","kind":"assigned","target":{…},"at":1791421810141}]

: ping
```

- On connect, and whenever the list changes, an event `pending` whose
  `data` is the whole list, exactly as `wake:pending` answers it. An app
  MAY send an unchanged list again.
- A comment line (`: ping`) at least every 30 seconds while nothing
  changes, so Wake can tell a quiet stream from a dead one.
- The app MAY end the stream at any time (a serverless time limit, a
  deploy); Wake connects again, sooner after a clean end than after an
  error, and honours a `retry:` field.
- Without that `Accept` header, the route MUST answer `200` with the list
  as JSON. Wake falls back to asking for it every 30 seconds when the
  stream keeps failing (a proxy that buffers it, say).

### `POST {httpBase}/wake/v1/claim`

`{ "id": "…" }` → `200` with `wake:claim`'s answer.

### `POST {httpBase}/wake/v1/started` (optional)

`{ "id": "…", "run": { "name", "tool", "session"? } }` → `204`. An app
that does not serve it answers `404`, and Wake does without it, as it does
for a deployment without `wake:started`.

### `POST {httpBase}/wake/v1/finish`

`{ "id": "…", "outcome": "done" | "failed", "reason"?: "…" }` → `204`.

### `POST {httpBase}/wake/v1/waiting` (optional)

`{ "id": "…", "waiting": true | false }` → `204`. An app that does not
serve it answers `404`, and Wake does without it.

## Devices that watch

A device lists an agent's summonses for its owner, asking ones included,
and gives the owner's yes or no to an ask. It holds one watch key for one
agent in one app: a device watching three apps holds three. An app that
makes no watch codes serves none of this, and still works with Wake; its
runs just reach no device.

### The watch code

The app makes a watch code only in its own interface, for an agent's owner
signed in there, when they ask to add a device. There is no call for it
(principle 5). The app MUST:

- bind the code to that agent;
- make it single-use and valid for at most ten minutes;
- give it at least 39 bits of entropy, and accept it as it accepts a pair
  code;
- store only a hash of it;
- make one only where the agent's plan includes devices (`devices` in
  [`wake:watching`](#wakewatching-query)). An app without plans includes
  them.

It SHOULD show the code with the link
`wake://watch?domain=<domain>&code=<code>`, as text and as a QR code, so a
device can take it without typing.

### `POST {httpBase}/wake/v1/watch`

Request, JSON:

```json
{ "code": "M4TR-8QXC", "device": { "name": "Ada's iPhone", "platform": "ios" } }
```

`200`, JSON:

```json
{
  "watchKey": "gwk_…",
  "app": "acme",
  "agent": { "id": "j974w1ceam6q…", "name": "Claude", "tool": "claude" }
}
```

| Field | Rule |
| --- | --- |
| `device.name` | What the owner calls the device, shown in the app's list of them: 1 to 100 characters, no control or format characters. |
| `device.platform` | `ios`, `darwin` or `web`. |
| `watchKey` | As `placeKey`: 16 to 512 printable ASCII characters, at least 128 bits of entropy, an app prefix allowed. Shown once. |
| `app`, `agent` | As in the pairing answer. |

Errors are pairing's: `400 invalid_body`, `400 code_invalid` and
`403 agent_unavailable`. The app MUST store the watch key only as its
SHA-256 hash, in lower-case hex, made with real randomness, as a place key
is. It SHOULD list the device under its agent, for the owner to remove.

A watch key opens nothing once the device sends it to
`POST {httpBase}/wake/v1/forget` (`204`, or `401 unpaired`), once the owner
removes the device in the app, or once the agent is revoked, as its places
are. A plan that stops including devices does not close it: the watch
calls answer `not-in-plan` until the plan includes them again.

### The watch calls

Each is a public Convex function on `convexUrl`'s deployment, with the
watch key as its `key` argument, and a route under `httpBase` with the key
as `Authorization: Bearer <watchKey>`; a device uses the one discovery's
transport names. Each finds the device by its key's SHA-256 hash and
answers for that device's agent only. A key that opens nothing here, a
place key among them, is `UNPAIRED` (`401 unpaired`), as for the place
calls. A call whose arguments break a rule below changes nothing: its route
answers `400 invalid_body`, and its function throws
`ConvexError("INVALID_BODY")`. The routes read no cookies, so they SHOULD
allow cross-origin requests (CORS) with the `Authorization` header, for a
device in a browser.

| Function | Route | |
| --- | --- | --- |
| `wake:runs` (query) | `GET …/wake/v1/runs` | The agent's summonses. |
| `wake:answer` (mutation) | `POST …/wake/v1/answer` | Yes or no to an ask. |
| `wake:places` (query) | `GET …/wake/v1/places` | The agent's places. |
| `wake:watching` (query) | `GET …/wake/v1/watching` | What the plan includes. |
| `wake:push` (mutation) | `POST …/wake/v1/push` | Where to send alerts. |
| `wake:activity` (mutation) | `POST …/wake/v1/activity` | A Live Activity's own token. |

An app that makes watch codes MUST serve the first four. It serves
`wake:push` and `wake:activity` when it sends alerts; without them, a
device refreshes `wake:runs` itself.

**Not in the plan.** Where the agent's plan does not include devices,
every watch call except `wake:watching` answers `402` with
`error: "not-in-plan"`, and its function throws
`ConvexError("not-in-plan")`. `forget` still forgets. A key that opens
nothing is `UNPAIRED` first.

#### `wake:runs` (query)

`{ key }` → an array of the agent's summonses, newest first, asking ones
included, at most 100. An app MAY list only as far back as the plan keeps
history. A summons as a device sees it:

```json
{
  "id": "pd77ydnv…",
  "app": "acme",
  "kind": "assigned",
  "target": { "kind": "ticket", "ref": "ACME-70", "url": "https://acme.dev/t/ACME-70" },
  "repo": "acme/widgets",
  "branch": "acme-70-fix-the-thing",
  "at": 1791421810141,
  "state": "claimed",
  "run": { "name": "amber-heron", "tool": "claude", "session": "4f9c2d1e…", "startedAt": 1791421822410 },
  "place": { "name": "Ada's MacBook" },
  "waiting": true
}
```

| Field | Rule |
| --- | --- |
| `id` to `at` | As in `wake:pending`. |
| `state` | `asking`, `open`, `claimed`, `done`, `failed` or `dropped` ([A summons's life](#a-summonss-life)). |
| `asker.name` | Who asked: 1 to 64 characters, no control or format characters. Present while the summons is `asking`, and only then. |
| `run` | Once `wake:started` named its run: `name`, `tool` and `session` as there, and `startedAt` in milliseconds. `session` is the owner's to see, and only the owner's devices hold watch keys. |
| `place.name` | The place that claimed it, by the `machine.name` it paired with: 1 to 100 characters, no control or format characters. From the claim on. |
| `waiting` | `true` while the claimed run waits on its owner (`wake:waiting`); absent or `false` otherwise. |
| `endedAt` | When it became `done`, `failed` or `dropped`, in milliseconds. |
| `reason` | `wake:finish`'s reason, at most 300 characters. |

It carries no text, as `wake:pending` carries none: what asked is read in
the app (principle 1). An app MAY add fields; a device ignores what it does
not know, and skips a summons that breaks a rule above.

Over HTTP, `GET {httpBase}/wake/v1/runs` streams as `GET …/pending` does:
an event `runs` whose `data` is the whole list, on connect and whenever it
changes, the same pings and `retry:`, and the list as JSON without
`Accept: text/event-stream`.

#### `wake:answer` (mutation)

`{ key, id, yes }` → `null`. On an asking summons of the key's agent,
`yes: true` moves it to `open`, where places see it, and `yes: false` moves
it to `dropped`. Any other call does nothing: the summons was answered
already, is not asking, or is not this agent's. The device sees what
happened in `wake:runs`. A device SHOULD check, at the moment of a yes,
that the person holding it is its owner (a passcode, biometrics, a
passkey). Over HTTP, `POST …/answer` with `{ "id": "…", "yes": true }` →
`204`.

#### `wake:places` (query)

`{ key }` → an array of the agent's places that are not forgotten, most
recently paired first, at most 50:

```json
{ "name": "Ada's MacBook", "platform": "darwin", "pairedAt": 1791421810141, "lastClaimAt": 1791421822410 }
```

| Field | Rule |
| --- | --- |
| `name` | As `place.name` in `wake:runs`. |
| `platform` | The `machine.platform` it paired with: `^[a-z][a-z0-9_-]{0,39}$` (`darwin`, `linux`). |
| `pairedAt` | When it paired, in milliseconds. |
| `lastClaimAt` | When it last won a claim, in milliseconds; absent before its first. |

Over HTTP, `GET …/places` → `200` with the list.

#### `wake:watching` (query)

`{ key }` → what this device watches, and what the agent's plan includes:

```json
{
  "app": "acme",
  "agent": { "id": "j974w1ceam6q…", "name": "Claude", "tool": "claude" },
  "devices": "included",
  "alerts": "not-in-plan"
}
```

`app` and `agent` are as in the pairing answer; `devices` and `alerts` are
each `included` or `not-in-plan`. It answers on every plan, so a device can
say plainly what a plan includes. Over HTTP, `GET …/watching` → `200`.

#### `wake:push` (mutation)

`{ key, kinds, apns?, liveActivity?, webPush? }` → `null`: where this
device takes alerts, and which. A later call replaces an earlier one, and
`kinds: []` turns alerts off.

```json
{
  "kinds": ["ask", "waiting", "failed"],
  "apns": { "token": "8d3f…", "environment": "production" },
  "liveActivity": { "pushToStartToken": "41ac…" }
}
```

| Field | Rule |
| --- | --- |
| `kinds` | The alerts it wants, each at most once: `ask` (a summons is asking), `waiting`, `started`, `done`, `failed`. |
| `apns` | From an `ios` or `darwin` device: its APNs device `token`, hex, 16 to 512 characters, and `environment`, `production` or `development`. |
| `liveActivity` | Optional, with `apns`: a `pushToStartToken`, hex as `apns.token`, which can only start a Live Activity. |
| `webPush` | From a `web` device: its push subscription's `endpoint`, an `https:` URL without credentials, at most 2048 characters, and `keys.p256dh` and `keys.auth`, base64url without padding, 16 to 256 characters. |

Exactly one of `apns` and `webPush`, as the device's platform says. The
app sends only alerts of these kinds, and only while `alerts` is
`included`. An alert carries no text: only the app, the summons's `id`,
the alert's kind, `target.ref`, the run's name and tool, the asker's name
(`ask` only) and `reason` (`failed` only). Whoever sends a Web Push SHOULD
send only to the push services browsers use, so a device cannot aim the
app's server at another host. Over HTTP, `POST …/push` → `204`.

#### `wake:activity` (mutation)

`{ key, id, pushToken }` → `null`. A Live Activity started for summons
`id` has its own update token, hex as `apns.token`; the device sends it
when the system issues it, and again when it changes. The app updates and
ends that activity with it: a start token only starts one. A call for a
summons that is not the key's agent's does nothing. Over HTTP,
`POST …/activity` with `{ "id": "…", "pushToken": "…" }` → `204`.

## A summons's life

```
asking ──owner says yes──▶ open ──claim──▶ claimed ──finish──▶ done | failed
                                                (started: running, named)
   └────────┬─────────────────┘
            └──no longer wanted──▶ dropped
```

- **asking**: made by someone other than the agent's owner; invisible to
  places until the owner says yes, in the app or from a device
  (`wake:answer`). A summons made by the owner starts open.
- **open**: listed by `wake:pending`. If nothing claims it within thirty
  minutes, the app SHOULD tell the asker where it was made. It stays open:
  a machine that wakes later still claims it.
- **dropped**: no longer wanted (unassigned, closed, answered from a live
  session, or the owner said no) while asking or open. A claimed summons is
  its run's to end.
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

A new field, a new function Wake can do without (`wake:started`,
`wake:waiting`), a new key and the calls only it opens (the watch key), or
a new transport named in discovery (`http`) is additive and stays
`wake/v1`: an app that served `wake/v1` before serves it unchanged, what a
place sees and may do is unchanged, and a Wake too old for a transport
refuses to pair with that app rather than misread it. Anything else (a field's
meaning, a rule, a route) is `wake/v2`, announced in discovery's `version`;
an app serves both until Wake's installed versions have moved.
