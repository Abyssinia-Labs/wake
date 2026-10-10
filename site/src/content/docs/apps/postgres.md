---
title: On Postgres
description: "@abyssinia-labs/wake-server: the server half of wake/v1 over HTTP, for any TypeScript app, on Postgres with Drizzle."
---

```bash
bun add @abyssinia-labs/wake-server drizzle-orm
```

No Convex needed: Wake reaches your app over the
[HTTP transport](/spec/wake-v1/#the-http-transport), and the pending list
comes as server-sent events. It runs anywhere the Fetch API does: Next.js,
Hono, Bun, Deno, Cloudflare Workers. Storage is Postgres through Drizzle,
with any driver.

## Install

Add the three tables to your Drizzle schema and migrate as usual:

```ts
export { wakeCodes, wakePlaces, wakeSummonses } from "@abyssinia-labs/wake-server/drizzle";
```

## Wire it up

```ts
import { drizzleStore } from "@abyssinia-labs/wake-server/drizzle";
import { discovery, Wake, wakeHandler } from "@abyssinia-labs/wake-server";

export const wake = new Wake({ app: "acme", store: drizzleStore(db), keyPrefix: "acme_" });
const routes = wakeHandler(wake);
```

Mount `routes` under your `httpBase`. It answers its own paths and `null`
for anything else. In Next.js, `app/api/wake/v1/[route]/route.ts`:

```ts
const handle = async (req: Request) => (await routes(req)) ?? new Response(null, { status: 404 });
export { handle as GET, handle as POST };
export const dynamic = "force-dynamic";
```

Serve discovery at `/.well-known/wake`:

```ts
Response.json(discovery({ httpBase: "https://acme.dev/api" }));
```

## Call it from your app

The same calls as [the Convex component](/apps/convex/): `issueCode` for
your "pair Wake" tool, `summon` when a person assigns or mentions an agent,
`answer`, `settle`, `forSubject` to show a run by name where it was asked,
`forOwner` for a person's runs list, `places`, `forgetPlace`,
`revokeAgent` and `deleteScope`. See [Examples](/apps/examples/) for the
summon calls and prompts; they read the same.

## Several instances, and serverless

A change made in the same process reaches Wake at once; each open stream
also reads the list again every 10 seconds (`pollMs`), so a change another
instance made arrives within that. On a host with a request time limit,
set `maxStreamMs` under it and Wake reconnects when the stream ends.

## Try it

The repository's
[`packages/server/example/server.ts`](https://github.com/Abyssinia-Labs/wake/blob/main/packages/server/example/server.ts)
is the smallest app that serves wake/v1 this way:

```bash
bun packages/server/example/server.ts
wake check localhost:3210
```
