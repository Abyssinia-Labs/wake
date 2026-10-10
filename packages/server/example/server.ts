// The smallest app that serves wake/v1 over HTTP: Bun's server, Postgres
// in-process (PGlite; any Drizzle Postgres driver works the same), and two
// stand-ins for what a real app already has: its agents' "pair Wake" tool
// and its "assign to my agent" button.
//
//   bun packages/server/example/server.ts
//   wake check localhost:3210
//   curl -X POST localhost:3210/demo/code     # then run the command it gives
//   curl -X POST localhost:3210/demo/assign   # and your agent starts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { discovery, pairCommand, Wake, wakeHandler } from "../src";
import { drizzleStore, WAKE_TABLES_SQL } from "../src/drizzle";

const port = Number(process.env.PORT ?? 3210);
const origin = `http://localhost:${port}`;

const client = new PGlite();
await client.exec(WAKE_TABLES_SQL);
const wake = new Wake({ app: "example", store: drizzleStore(drizzle(client)), keyPrefix: "ex_" });
const routes = wakeHandler(wake);

Bun.serve({
  port,
  // Server-sent events stay open: no idle cut-off.
  idleTimeout: 0,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    if (pathname === "/.well-known/wake") {
      return Response.json(discovery({ httpBase: `${origin}/api` }));
    }
    if (req.method === "POST" && pathname === "/demo/code") {
      const { code } = await wake.issueCode({
        agent: "agent-1",
        agentName: "Claude",
        owner: "you",
        tool: "claude",
      });
      return Response.json({ command: pairCommand(`localhost:${port}`, code) });
    }
    if (req.method === "POST" && pathname === "/demo/assign") {
      const id = await wake.summon({
        agent: "agent-1",
        owner: "you",
        askedBy: "you",
        subject: "EX-1",
        kind: "assigned",
        target: { kind: "ticket", ref: "EX-1", url: `${origin}/tickets/EX-1` },
        prompt: "This is the example app: say hello in your terminal, then finish.",
      });
      return Response.json({ id, runs: await wake.forSubject("EX-1") });
    }
    return (await routes(req)) ?? new Response("Not found", { status: 404 });
  },
});
console.log(`wake/v1 over HTTP at ${origin}`);
