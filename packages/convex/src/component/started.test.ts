/// <reference types="vite/client" />
// wake:started (the spec's optional function): the run's name, tool and
// session, from the place that claimed it, while it is claimed.
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { hashSecret, newPairCode, newPlaceKey } from "./keys.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");

async function place(t: ReturnType<typeof convexTest>, machine: string): Promise<string> {
  const code = newPairCode();
  await t.mutation(api.places.storeCode, {
    agent: "agent-1",
    agentName: "Claude",
    owner: "ada",
    codeHash: await hashSecret(code),
    expiresAt: Date.now() + 600_000,
  });
  const key = newPlaceKey("ex_");
  await t.mutation(api.places.pair, {
    codeHash: await hashSecret(code),
    keyHash: await hashSecret(key),
    machine,
    platform: "darwin",
  });
  return key;
}

async function claimed(t: ReturnType<typeof convexTest>, key: string): Promise<string> {
  const id = await t.mutation(api.summonses.summon, {
    agent: "agent-1",
    owner: "ada",
    askedBy: "ada",
    subject: "ticket-1",
    kind: "assigned",
    target: { kind: "ticket", ref: "ACME-1", url: "https://app.example.com/t/ACME-1" },
    prompt: "Read ACME-1.",
  });
  await t.mutation(api.wire.claim, { key, id });
  return id;
}

const shown = async (t: ReturnType<typeof convexTest>) =>
  (await t.query(api.summonses.forSubject, { subject: "ticket-1" }))[0]?.run;

test("the claimer names its run, then fills in the session when it learns it", async () => {
  const t = convexTest(schema, modules);
  const key = await place(t, "Ada's Mac");
  const id = await claimed(t, key);
  await t.mutation(api.wire.started, { key, id, run: { name: "amber-heron", tool: "codex" } });
  const first = await shown(t);
  expect(first).toMatchObject({ name: "amber-heron", tool: "codex", machine: "Ada's Mac" });
  expect(first).not.toHaveProperty("session");
  await t.mutation(api.wire.started, {
    key,
    id,
    run: { name: "amber-heron", tool: "codex", session: "0199c2f4-77aa-7b1e" },
  });
  const second = await shown(t);
  expect(second?.session).toBe("0199c2f4-77aa-7b1e");
  expect(second?.startedAt).toBe(first?.startedAt);
});

test("another place, an unclaimed or finished summons, or a bad name changes nothing", async () => {
  const t = convexTest(schema, modules);
  const key = await place(t, "Ada's Mac");
  const other = await place(t, "Ada's laptop");
  const id = await claimed(t, key);
  const run = { name: "amber-heron", tool: "claude" as const };
  await t.mutation(api.wire.started, { key: other, id, run });
  await t.mutation(api.wire.started, { key, id, run: { ...run, name: "Not A Name" } });
  await t.mutation(api.wire.started, { key, id, run: { ...run, session: "../etc" } });
  expect(await shown(t)).toBeUndefined();
  await t.mutation(api.wire.finish, { key, id, outcome: "done" });
  await t.mutation(api.wire.started, { key, id, run });
  expect(await shown(t)).toBeUndefined();
  await expect(t.mutation(api.wire.started, { key: "ex_nope", id, run })).rejects.toThrow(
    "UNPAIRED",
  );
});
