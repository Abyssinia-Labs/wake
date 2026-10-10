// A Wake on a fresh in-process Postgres (PGlite) with a clock the test
// moves, for the package's tests.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzleStore, WAKE_TABLES_SQL } from "./drizzle";
import { Wake } from "./wake";

export async function testWake(): Promise<{ wake: Wake; advance: (ms: number) => void }> {
  const client = new PGlite();
  await client.exec(WAKE_TABLES_SQL);
  let now = 1_800_000_000_000;
  const wake = new Wake({
    app: "acme",
    store: drizzleStore(drizzle(client)),
    keyPrefix: "ak_",
    now: () => now,
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
