# @abyssinia-labs/wake-server

The server half of [wake/v1](../../docs/spec/wake-v1.md) for any TypeScript
app, over the HTTP transport: no Convex needed. Add it and your users'
coding agents (Claude Code, Codex, Cursor) start on their own machines when
someone assigns them work or mentions them, through [Wake](../../README.md).
Storage is Postgres through [Drizzle](https://orm.drizzle.team) (any
driver: node-postgres, postgres.js, Neon, PGlite).

You decide **what** summons an agent and write the prompt. This keeps the
rest: pair codes and place keys (stored as hashes), places, the summons's
life, the race to claim, the thirty-minute unclaimed notice, run names and
sessions, a person's runs list, revocation, and the routes Wake calls,
with the pending list as server-sent events.

## Install

```bash
bun add @abyssinia-labs/wake-server drizzle-orm
```

Add the tables to your Drizzle schema and migrate as usual:

```ts
export { wakeCodes, wakePlaces, wakeSummonses } from "@abyssinia-labs/wake-server/drizzle";
```

(or run `WAKE_TABLES_SQL` once).

## Wire it up

```ts
import { drizzleStore } from "@abyssinia-labs/wake-server/drizzle";
import { discovery, Wake, wakeHandler } from "@abyssinia-labs/wake-server";

export const wake = new Wake({ app: "acme", store: drizzleStore(db), keyPrefix: "acme_" });
const routes = wakeHandler(wake);
```

`wakeHandler` takes a `Request` and answers a `Response` for its own
routes (`…/wake/v1/pair`, `forget`, `pending`, `claim`, `started`,
`finish`), or `null` for any other path. In a Next.js route handler,
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
| `wake.summon({ agent, owner, askedBy, scope?, subject, kind, target, repo?, branch?, prompt })` | A person assigned or mentioned an agent. |
| `wake.answer({ id, yes })` | The owner answered a summons someone else made. |
| `wake.settle({ subject, agent?, kind?, state, reason })` | It stopped being wanted: unassigned, closed, answered. |
| `wake.forSubject(subject)` | Each agent's latest summons where it was made, with its `run` (name, tool, machine, and the session for the owner's eyes). |
| `wake.forOwner({ owner, scope?, limit? })` | A person's runs list. |
| `wake.places(agent)`, `wake.forgetPlace({ agent, place })` | An agent's machines. |
| `wake.revokeAgent(agent)` | When you revoke an agent. |
| `wake.deleteScope(scope)` | A workspace is deleted; call until `done`. |

It has no notion of who is signed in: check who may do what first. A
summons Wake would refuse is refused at `summon` with
`WakeError("INVALID_SUMMONS")`.

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

## Other databases

Storage is the `WakeStore` interface; Postgres through Drizzle is the first
implementation. Prisma and SQLite / D1 are planned.
