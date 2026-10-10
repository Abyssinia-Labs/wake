---
title: The Convex component
description: "@abyssinia-labs/wake-convex: the whole server half of wake/v1 as a Convex component."
---

```bash
bun add @abyssinia-labs/wake-convex
```

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

## Test with it

```ts
import wake from "@abyssinia-labs/wake-convex/test";

const t = convexTest(schema, modules);
wake.register(t);
```

See [Examples](/apps/examples/) for the summon calls and prompts of a
tracker and a doc editor.
