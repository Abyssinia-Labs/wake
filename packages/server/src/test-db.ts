// A Wake on a fresh in-process database, Postgres (PGlite) or SQLite
// (bun:sqlite through Drizzle's async proxy, as D1 is async), with a clock
// the test moves. Every scenario runs on both (WAK-9).
import { Database, type SQLQueryBindings } from "bun:sqlite";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as sqliteProxy } from "drizzle-orm/sqlite-proxy";
import { drizzleStore, WAKE_TABLES_SQL } from "./drizzle";
import { sqliteStore, WAKE_SQLITE_TABLES } from "./sqlite";
import type { WakeStore } from "./store";
import { Wake, type WakeOptions } from "./wake";

export const STORES = ["postgres", "sqlite"] as const;
export type StoreKind = (typeof STORES)[number];

/** A fresh database of `kind` with the tables made, its store, and a way to run SQL on it. */
export async function databaseOf(
  kind: StoreKind,
): Promise<{ store: WakeStore; run: (sql: string) => Promise<void> }> {
  if (kind === "postgres") {
    const client = new PGlite();
    await client.exec(WAKE_TABLES_SQL);
    return {
      store: drizzleStore(drizzle(client)),
      run: async (sql) => {
        await client.exec(sql);
      },
    };
  }
  const sqlite = new Database(":memory:");
  for (const statement of WAKE_SQLITE_TABLES) sqlite.run(statement);
  const store = sqliteStore(
    sqliteProxy(async (sql, params, method) => {
      const query = sqlite.query(sql);
      const bound = params as SQLQueryBindings[];
      if (method === "run") {
        query.run(...bound);
        return { rows: [] };
      }
      const rows = query.values(...bound);
      return { rows: method === "get" ? (rows[0] ?? []) : rows };
    }),
  );
  return {
    store,
    run: async (sql) => {
      sqlite.run(sql);
    },
  };
}

export async function testWake(
  kind: StoreKind,
  o: Pick<WakeOptions, "hooks" | "plan"> = {},
  store?: WakeStore,
): Promise<{ wake: Wake; advance: (ms: number) => void }> {
  let now = 1_800_000_000_000;
  const wake = new Wake({
    app: "acme",
    store: store ?? (await databaseOf(kind)).store,
    keyPrefix: "ak_",
    now: () => now,
    ...o,
  });
  return { wake, advance: (ms) => (now += ms) };
}

export async function pairedKey(
  wake: Wake,
  machine = "Ada's Mac",
  agent = "agent-1",
): Promise<string> {
  const { code } = await wake.issueCode({
    agent,
    agentName: "Claude",
    owner: "ada",
    scope: "w1",
    tool: "claude",
  });
  return (await wake.pair({ code, machine: { name: machine, platform: "darwin" } })).placeKey;
}

/** A device of `agent`'s owner, added with a watch code as the owner's app would. */
export async function watchKey(
  wake: Wake,
  platform: "ios" | "darwin" | "web" = "ios",
  agent = "agent-1",
): Promise<string> {
  const { code } = await wake.issueWatchCode({
    agent,
    agentName: "Claude",
    owner: "ada",
    scope: "w1",
    tool: "claude",
  });
  return (await wake.watch({ code, device: { name: "Ada's iPhone", platform } })).watchKey;
}

export function ask(over: Record<string, unknown> = {}) {
  return {
    agent: "agent-1",
    owner: "ada",
    askedBy: "ada",
    scope: "w1",
    subject: "ticket-1",
    kind: "assigned",
    target: { kind: "ticket", ref: "ACME-1", url: "https://acme.dev/t/ACME-1" },
    repo: "acme/widgets",
    branch: "acme-1-fix",
    prompt: "Read ACME-1 with getticket, then do what it asks.",
    ...over,
  };
}
