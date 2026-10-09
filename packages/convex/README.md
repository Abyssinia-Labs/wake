# @abyssinia-labs/wake-convex

The server half of [wake/v1](../../docs/spec/wake-v1.md) as a Convex
component. Add it to a Convex app and your users' coding agents (Claude
Code, Codex, Cursor) start on their own machines when someone assigns them
work or mentions them, through [Wake](../../README.md).

You decide **what** summons an agent (an assignment, a mention) and write
the prompt. The component keeps everything wake/v1 requires: pair codes and
place keys (stored as hashes), places, the summons's life (asking, open,
claimed, done, failed, dropped), the race to claim, the thirty-minute
unclaimed notice, and the three functions and two routes Wake calls.

## Install

```bash
bun add @abyssinia-labs/wake-convex
```

`convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import wake from "@abyssinia-labs/wake-convex/convex.config";

const app = defineApp();
app.use(wake);
export default app;
```

## Serve wake/v1

**The three functions** must be called `wake:pending`, `wake:claim` and
`wake:finish`, so they go in `convex/wake.ts`:

```ts
import { exposeApi } from "@abyssinia-labs/wake-convex";
import { components } from "./_generated/api";

export const { pending, claim, finish } = exposeApi(components.wake, { app: "acme" });
```

They take no auth: the place key is the credential, and the component
checks it. `app` is your app's name in wake/v1: lower case, digits and
dashes. Wake uses it as a folder name and as the name of your MCP server in
the agent.

**The two routes**, in `convex/http.ts`:

```ts
import { httpRouter } from "convex/server";
import { registerRoutes } from "@abyssinia-labs/wake-convex";
import { components } from "./_generated/api";

const http = httpRouter();
registerRoutes(http, components.wake, { app: "acme", keyPrefix: "acme_" });
export default http;
```

**Discovery.** Serve `https://<your domain>/.well-known/wake` with
`discovery({ convexUrl, httpBase })`, from wherever your domain is served.
If your domain is your Convex site, pass `discovery` to `registerRoutes`
and it is served for you.

## Wire it to your app

```ts
import { pairCommand, Wake } from "@abyssinia-labs/wake-convex";
import { components } from "./_generated/api";

const wake = new Wake(components.wake, { app: "acme" });
```

**Pairing.** Give your agents a tool (MCP or API) that answers "pair Wake".
Make the code in an action or HTTP action (it needs real randomness):

```ts
const { code } = await wake.issueCode(ctx, {
  agent: agent._id,          // the calling agent
  agentName: agent.name,
  owner: agent.ownerId,      // its person
  tool: "claude",            // the program that asked, when you can tell
});
return { command: pairCommand("acme.dev", code) };
```

**Summoning.** When a person assigns a ticket to an agent or mentions it:

```ts
await wake.summon(ctx, {
  agent: agent._id,
  owner: agent.ownerId,
  askedBy: userId,           // a person; an agent's own write never summons
  subject: ticket._id,       // one live summons per agent per subject
  kind: "assigned",
  target: { kind: "ticket", ref: "ACME-70", url: "https://acme.dev/t/ACME-70" },
  repo: "acme/widgets",      // optional, with branch: Wake makes a worktree there
  branch: "acme-70-fix-the-thing",
  prompt,                    // which tools to call and how to finish; never the text that asked
});
```

When the owner asks, it opens at once. When someone else asks, it waits for
the owner's `wake.answer(ctx, { id, yes })`. A summons Wake would refuse (a
control character in `ref`, a non-https `url`, a branch like `../main`) is
refused here with `INVALID_SUMMONS`. Never name a repository's default
branch: Wake refuses to run on it.

**The rest:**

| Call | When |
| --- | --- |
| `wake.settle(ctx, { subject, agent?, kind?, state, reason })` | It stopped being wanted: unassigned, closed, answered from a live session. |
| `wake.forSubject(ctx, subject)` | Show each agent's latest summons where it was made: state, reason, `unclaimed` after thirty minutes. |
| `wake.places(ctx, agent)` / `wake.forgetPlace(ctx, { agent, place })` | An agent's machines, on your agents screen. |
| `wake.revokeAgent(ctx, agent)` | In the same mutation that revokes an agent: its keys, codes and waiting summonses end. |
| `wake.deleteScope(ctx, scope)` | A tenant (workspace) is deleted: one batch of its rows; call again until `done`. Pass `scope` when you pair and summon. |

The component has no `ctx.auth`: check who may do what in your functions
before you call it.

## Check it

```bash
wakectl check acme.dev
```

It probes your app the way Wake will, with inputs your app must refuse, so
it pairs nothing and changes nothing.

In your own tests, register the component with convex-test:

```ts
import wake from "@abyssinia-labs/wake-convex/test";

const t = convexTest(schema, modules);
wake.register(t);
```

## Develop

```bash
bun install
bun run --cwd packages/convex test
bun run --cwd packages/convex typecheck
```

Code generation needs a Convex deployment. A local, anonymous one is
enough: `CONVEX_AGENT_MODE=anonymous bunx convex init`, then
`bunx convex codegen --component-dir ./src/component`. Commit what it
writes under `_generated`.

## License

[MIT](LICENSE) © Abyssinia Labs LLC
