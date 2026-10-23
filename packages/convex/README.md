# @abyssinia-labs/wake-convex

The server half of [wake/v1](../../docs/spec/wake-v1.md) as a Convex
component. Add it to a Convex app and your users' coding agents (Claude
Code, Codex, Cursor) start on their own machines when someone assigns them
work or mentions them, through [Wake](../../README.md).

You decide **what** summons an agent (an assignment, a mention) and write
the prompt. The component keeps everything wake/v1 requires: pair codes and
place keys (stored as hashes), places, the summons's life (asking, open,
claimed, done, failed, dropped), the race to claim, the thirty-minute
unclaimed notice, and the functions and routes Wake calls. It also serves
the calls of [devices that watch](#devices-that-watch): a phone or a
browser where an agent's owner sees its runs and answers asks.

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

**The functions** must be called `wake:pending`, `wake:claim`,
`wake:started`, `wake:finish` and `wake:waiting`, so they go in
`convex/wake.ts`:

```ts
import { exposeApi } from "@abyssinia-labs/wake-convex";
import { components } from "./_generated/api";

export const { pending, claim, started, finish, waiting } = exposeApi(components.wake, {
  app: "acme",
});
```

They take no auth: the place key is the credential, and the component
checks it. `app` is your app's name in wake/v1: lower case, digits and
dashes. Wake uses it as a folder name and as the name of your MCP server in
the agent.

**The routes** (pair, watch and forget), in `convex/http.ts`:

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
the owner's `wake.answer(ctx, { id, yes })`, or their yes from a device;
pass `askerName` (the asker's name) so the device can say who asks. A summons Wake would refuse (a
control character in `ref`, a non-https `url`, a branch like `../main`) is
refused here with `INVALID_SUMMONS`. Never name a repository's default
branch: Wake refuses to run on it.

**The rest:**

| Call | When |
| --- | --- |
| `wake.settle(ctx, { subject, agent?, kind?, state, reason })` | It stopped being wanted: unassigned, closed, answered from a live session. |
| `wake.forSubject(ctx, subject)` | Show each agent's latest summons where it was made: state, reason, `unclaimed` after thirty minutes, and `run` once Wake says it started (`name`, `tool`, `machine`, `startedAt`, and `session`, which only the agent's owner should see). |
| `wake.forOwner(ctx, { owner, scope?, limit? })` | A person's runs list, outside the comments: their agents' summonses, newest first, without the dropped, each with its `target` and `run`. Check the caller is `owner`. |
| `wake.places(ctx, agent)` / `wake.forgetPlace(ctx, { agent, place })` | An agent's machines, on your agents screen. |
| `wake.devices(ctx, agent)` / `wake.forgetDevice(ctx, { agent, device })` | The devices watching an agent, for its owner to see and remove. |
| `wake.revokeAgent(ctx, agent)` | In the same mutation that revokes an agent: its keys, codes and waiting summonses end. |
| `wake.deleteScope(ctx, scope)` | A tenant (workspace) is deleted: one batch of its rows; call again until `done`. Pass `scope` when you pair and summon. |

The component has no `ctx.auth`: check who may do what in your functions
before you call it.

## Devices that watch

An agent's owner can follow its runs and say yes or no to an ask from a
phone, a browser or a desktop app (the spec's
[Devices that watch](../../docs/spec/wake-v1.md#devices-that-watch)). Each
device holds a watch key for one agent. A watch key opens only these calls,
and a place key opens none of them, so nothing a run can reach can say yes.

**The functions**, beside Wake's in `convex/wake.ts`:

```ts
import { exposeWatchApi } from "@abyssinia-labs/wake-convex";
import type { DataModel } from "./_generated/dataModel";

export const { runs, answer, places, watching, push, activity } = exposeWatchApi<DataModel>(
  components.wake,
  {
    app: "acme",
    // What the agent's plan includes, read from your tables at each call.
    plan: async (ctx, { owner }) => {
      const paid = await isOnPaidPlan(ctx, owner);
      return { devices: paid ? "included" : "not-in-plan", alerts: "not-in-plan" };
    },
  },
);
```

Without `plan`, devices and alerts are included. On a plan without
devices, every watch call but `wake:watching` throws
`ConvexError("not-in-plan")`, and forget still forgets. `registerRoutes`
already serves `POST /wake/v1/watch`, with CORS, so a device in a browser
can call it.

**The watch code.** Make one only in your own interface, for the agent's
owner signed in there, when they ask to add a device, and only where the
plan includes devices. There is no public function for it, so nothing a run
can reach makes one. It needs real randomness, so call it from an action:

```ts
const { code } = await wake.issueWatchCode(ctx, { agent, agentName, owner, tool });
return { code, link: watchLink("acme.dev", code) }; // show the link as a QR code too
```

**Alerts.** A device tells you where it takes alerts (`wake:push`). Send
them only while the plan includes alerts, and only what the spec allows (no
text): `wake.alertTargets(ctx, { agent, kind, summons? })` lists the devices
that want an alert of that kind, how to reach each, and the summons's Live
Activity token on each that has one.

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
