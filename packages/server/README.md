# @abyssinia-labs/wake-server

The server half of [wake/v1](../../docs/spec/wake-v1.md) for any TypeScript
app, over the HTTP transport: no Convex needed. Add it and your users'
coding agents (Claude Code, Codex, Cursor) start on their own machines when
someone assigns them work or mentions them, through [Wake](../../README.md).
Storage is [Drizzle](https://orm.drizzle.team) on Postgres (node-postgres,
postgres.js, Neon, PGlite) or SQLite (Cloudflare D1, libSQL / Turso).

You decide **what** summons an agent and write the prompt. This keeps the
rest: pair codes and place keys (stored as hashes), places, the summons's
life, the race to claim, the thirty-minute unclaimed notice, run names and
sessions, a person's runs list, revocation, and the routes Wake calls,
with the pending list as server-sent events. It also serves
[devices that watch](#devices-that-watch): a phone or a browser where an
agent's owner sees its runs and answers asks.

## Install

```bash
bun add @abyssinia-labs/wake-server drizzle-orm
```

Add the tables to your Drizzle schema and migrate as usual:

```ts
export {
  wakeCodes,
  wakeDevices,
  wakePlaces,
  wakeSummonses,
  wakeWatchCodes,
} from "@abyssinia-labs/wake-server/drizzle";
```

(or run `WAKE_TABLES_SQL`, which is safe to run again).

**Upgrading from 0.4?** Devices that watch add two tables and three
columns (`wake_places.last_claim_at`, `wake_summonses.asker_name` and
`waiting`). Migrate them before you deploy the new release: drizzle-kit
finds them, and `WAKE_TABLES_SQL` run again adds them. On SQLite, run
`WAKE_SQLITE_DEVICES_UPGRADE` once.

## Wire it up

```ts
import { drizzleStore } from "@abyssinia-labs/wake-server/drizzle";
import { discovery, Wake, wakeHandler } from "@abyssinia-labs/wake-server";

export const wake = new Wake({ app: "acme", store: drizzleStore(db), keyPrefix: "acme_" });
const routes = wakeHandler(wake);
```

`wakeHandler` takes a `Request` and answers a `Response` for its own
routes (`…/wake/v1/pair`, `forget`, `pending`, `claim`, `started`,
`finish`, `waiting`, and the watch routes), or `null` for any other path. In a Next.js route handler,
`app/api/wake/v1/[route]/route.ts`:

```ts
const handle = async (req: Request) => (await routes(req)) ?? new Response(null, { status: 404 });
export { handle as GET, handle as POST };
export const dynamic = "force-dynamic";
```

Hono: `app.all("/api/wake/v1/*", async (c) => (await routes(c.req.raw)) ?? c.notFound())`.

And discovery, at `https://<your domain>/.well-known/wake`:

```ts
Response.json(discovery({ httpBase: "https://acme.dev/api" }));
```

## Call it from your app

The same calls as the Convex component:

| Call | When |
| --- | --- |
| `wake.issueCode({ agent, agentName, owner, scope?, tool? })` | Your "pair Wake" tool. Answer with `pairCommand(domain, code)`. |
| `wake.summon({ agent, owner, askedBy, askerName?, scope?, subject, kind, target, repo?, branch?, prompt })` | A person assigned or mentioned an agent. `askerName` is how the owner's devices say who asks. |
| `wake.answer({ id, yes })` | The owner answered a summons someone else made, in your app. |
| `wake.settle({ subject, agent?, kind?, state, reason })` | It stopped being wanted: unassigned, closed, answered. |
| `wake.forSubject(subject)` | Each agent's latest summons where it was made, with its `run` (name, tool, machine, and the session for the owner's eyes). |
| `wake.forOwner({ owner, scope?, limit? })` | A person's runs list. |
| `wake.places(agent)`, `wake.forgetPlace({ agent, place })` | An agent's machines. |
| `wake.issueWatchCode({ agent, agentName, owner, scope?, tool? })` | The owner, signed in to your app, adds a device. Show it with `watchLink(domain, code)`. |
| `wake.devices(agent)`, `wake.forgetDevice({ agent, device })` | The devices watching an agent, for its owner to see and remove. |
| `wake.alertTargets({ agent, kind, summons? })` | Which devices want an alert of `kind`, and how to reach each. |
| `wake.revokeAgent(agent)` | When you revoke an agent. |
| `wake.deleteScope(scope)` | A workspace is deleted; call until `done`. |

It has no notion of who is signed in: check who may do what first. A
summons Wake would refuse is refused at `summon` with
`WakeError("INVALID_SUMMONS")`.

## Devices that watch

An agent's owner can follow its runs and say yes or no to an ask from a
phone, a browser or a desktop app (the spec's
[Devices that watch](../../docs/spec/wake-v1.md#devices-that-watch)). Each
device holds a watch key for one agent. A watch key opens only the watch
routes (`watch`, `runs`, `answer`, `places`, `watching`, `push`,
`activity`), and a place key opens none of them, so nothing a run can
reach can say yes. `wakeHandler` serves them, with `runs` as server-sent
events like `pending`, and CORS so a device in a browser can call them.

**The plan.** Say what an agent's plan includes, and it is asked at each
watch call:

```ts
const wake = new Wake({
  app: "acme",
  store,
  plan: async ({ agent, owner, scope }) => ({
    devices: (await isPaid(owner)) ? "included" : "not-in-plan",
    alerts: "not-in-plan",
  }),
});
```

Without `plan`, devices and alerts are included. On a plan without
devices, every watch route but `watching` answers `402 not-in-plan`, and
`issueWatchCode` throws `WakeError("NOT_IN_PLAN")`. Forget still forgets.

**The watch code.** Make one only in your own interface, for the agent's
owner signed in there, when they ask to add a device. No route makes one,
so nothing a run can reach does:

```ts
const { code } = await wake.issueWatchCode({ agent, agentName, owner, tool });
return { code, link: watchLink("acme.dev", code) }; // show the link as a QR code too
```

**Alerts.** A device tells you where it takes alerts (`push`). Send them
only while the plan includes alerts, and only what the spec allows (no
text). `wake.alertTargets` lists the devices that want an alert of that
kind, how to reach each, and the summons's Live Activity token on each
device that has one.

## The pending stream

A change made in the same process reaches Wake at once. With several
instances behind a load balancer, each stream also reads the list again
every `pollMs` (10 s), so a change made elsewhere arrives within that. On a
host with a time limit per request (serverless), set `maxStreamMs` under
it; Wake reconnects when the stream ends:

```ts
wakeHandler(wake, { maxStreamMs: 25_000 });
```

## Try it

[`example/server.ts`](example/server.ts) is the smallest app that serves
wake/v1 this way, on Bun with Postgres in-process:

```bash
bun packages/server/example/server.ts
wake check localhost:3210
```

## On SQLite, and Cloudflare D1

The same tables for SQLite are in `@abyssinia-labs/wake-server/sqlite`:

```ts
import { drizzle } from "drizzle-orm/d1";
import { sqliteStore } from "@abyssinia-labs/wake-server/sqlite";

const wake = new Wake({ app: "acme", store: sqliteStore(drizzle(env.DB)), keyPrefix: "acme_" });
```

Create them with drizzle-kit from `wakePlaces`, `wakeCodes`,
`wakeSummonses`, `wakeWatchCodes` and `wakeDevices`, or run the statements
in `WAKE_SQLITE_TABLES` (one per entry, as D1 takes them). Tables made by
0.4 or earlier take `WAKE_SQLITE_DEVICES_UPGRADE`, once, before the new
release runs on them. The store takes an async driver (D1, libSQL); a
sync one such as bun:sqlite goes through `drizzle-orm/sqlite-proxy`.

On Workers with D1 the pending stream's re-reads cost rows read, not time
awake, so an idle app costs next to nothing. Each Worker request runs on
its own, so a summons reaches an open stream on its next read, within
`pollMs` (10 s by default; lower is quicker and reads more rows). Set
`maxStreamMs` to keep each stream inside a request's limits; Wake
reconnects.

## Other databases

Storage is the `WakeStore` interface. Prisma is planned. A store of your
own also keeps watch codes and devices (`insertWatchCode`, `useWatchCode`,
`insertDevice`, `deviceByKeyHash`, `devicesOf`, `patchDevice`) and lists an
agent's latest summonses (`latestOf`).
