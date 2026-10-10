---
title: The Convex component
description: "@abyssinia-labs/wake-convex: the whole server half of wake/v1 as a Convex component."
---

```bash
bun add @abyssinia-labs/wake-convex
```

The whole server half of [wake/v1](/spec/wake-v1/) in one Convex
component, its own tables beside yours. Gatherd and Antescript run on it.

## What's in it

- **Pairing.** One-use, ten-minute codes for your "pair Wake" tool, traded
  for a place key; only SHA-256 hashes are kept. Which tool asked (Claude
  Code, Codex, Cursor) travels with the code.
- **Places.** Each agent's machines, when each was last seen, forgetting
  one, and revoking an agent with all its keys, codes and waiting asks.
- **The summons's life.** Asking (waits for the owner's yes when someone
  else asked), open, claimed, done, failed, dropped. One live summons per
  agent per subject: a second ask joins the first.
- **The race.** The first machine to claim wins; every other is told it
  lost.
- **Nobody picked it up.** After thirty minutes an open summons is marked
  `unclaimed`, so you can say so where it was asked.
- **Run names and sessions.** Wake reports each run's two-word name, tool,
  machine and session (`wake:started`); you show it where it was asked, the
  session to the owner only.
- **A person's runs list.** Their agents' summonses across everything,
  newest first, for a top bar or a phone.
- **The rules, enforced.** A summons Wake would refuse is refused when you
  make it, and every function checks the key itself.
- **Deletion.** Everything kept for a workspace goes, in batches.

## Install

`convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import wake from "@abyssinia-labs/wake-convex/convex.config";

const app = defineApp();
app.use(wake);
export default app;
```

## The functions

They must be called `wake:pending`, `wake:claim`, `wake:started` and
`wake:finish`, so they go in `convex/wake.ts`:

```ts
import { exposeApi } from "@abyssinia-labs/wake-convex";
import { components } from "./_generated/api";

export const { pending, claim, started, finish } = exposeApi(components.wake, { app: "acme" });
```

They take no auth: the place key is the credential, and the component
checks it. `app` is your app's name in wake/v1 (lower case, digits,
dashes); Wake uses it as a folder name and as your MCP server's name.

## The two routes

`convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { registerRoutes } from "@abyssinia-labs/wake-convex";
import { components } from "./_generated/api";

const http = httpRouter();
registerRoutes(http, components.wake, { app: "acme", keyPrefix: "acme_" });
export default http;
```

## Discovery

Serve `https://<your domain>/.well-known/wake` from wherever your domain is
served:

```ts
import { discovery } from "@abyssinia-labs/wake-convex";

return Response.json(
  discovery({ convexUrl: "https://….convex.cloud", httpBase: "https://api.acme.dev" }),
);
```

If your domain is your Convex site, pass `discovery` to `registerRoutes`
instead.

## Wire it to your app

```ts
import { Wake } from "@abyssinia-labs/wake-convex";
import { components } from "./_generated/api";

export const wake = new Wake(components.wake, { app: "acme" });
```

| Call | When |
| --- | --- |
| `wake.issueCode(ctx, { agent, agentName, owner, scope?, tool? })` | Your "pair Wake" tool. Call it from an action or HTTP action. |
| `wake.summon(ctx, { agent, owner, askedBy, scope?, subject, kind, target, repo?, branch?, prompt })` | A person assigned or mentioned an agent. |
| `wake.answer(ctx, { id, yes })` | The owner answered a summons someone else made. |
| `wake.settle(ctx, { subject, agent?, kind?, state, reason })` | It stopped being wanted: unassigned, closed, answered. |
| `wake.forSubject(ctx, subject)` | Show each agent's latest summons where it was made, with its `run` (name, tool, machine, and the session, for the owner's eyes) once it started. |
| `wake.forOwner(ctx, { owner, scope?, limit? })` | A person's runs list, outside the comments: their agents' summonses, newest first, without the dropped, each with its `target` and `run`. Check the caller is `owner`. |
| `wake.places(ctx, agent)`, `wake.forgetPlace(ctx, { agent, place })` | An agent's machines, on your agents screen. |
| `wake.revokeAgent(ctx, agent)` | In the mutation that revokes an agent. |
| `wake.deleteScope(ctx, scope)` | A workspace is deleted; call until `done`. |

The component has no `ctx.auth`: check who may do what before you call it.
A summons Wake would refuse (a control character in `ref`, a non-https
`url`, a branch like `../main`) is refused at `summon` with
`INVALID_SUMMONS`.

## Show the run

Once Wake starts a run, `forSubject` returns it with a `run`: its `name`
(`amber-heron`), `tool`, `machine`, `startedAt` and `session`. Show the
name to everyone where the summons was made ("Claude is on it as
amber-heron"); show the machine, the session and `wake open amber-heron` to
the agent's owner only.

```ts
const rows = await wake.forSubject(ctx, ticketId);
return rows.map((row) => ({
  state: row.state,
  ...(row.run && {
    run: {
      name: row.run.name,
      ...(row.owner === viewerId && { machine: row.run.machine, session: row.run.session }),
    },
  }),
}));
```

For a runs list outside the comments, `wake.forOwner(ctx, { owner: viewerId,
scope: workspaceId })` gives the viewer's own agents' runs, each with its
`target` to link to.

Serve `started` from `convex/wake.ts` (above) and Wake tells your app every
run's start, so the agent never has to comment that it's on it. Leave it
out and the agent does.

## Test with it

```ts
import wake from "@abyssinia-labs/wake-convex/test";

const t = convexTest(schema, modules);
wake.register(t);
```

See [Examples](/apps/examples/) for the summon calls and prompts of a
tracker and a doc editor.
