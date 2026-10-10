import { expect, test } from "bun:test";
import { ask, pairedKey, testWake } from "./test-db";

test("a code pairs once, and not after ten minutes; the key opens only its agent", async () => {
  const { wake, advance } = await testWake();
  const { code } = await wake.issueCode({
    agent: "agent-1",
    agentName: "Claude",
    owner: "ada",
    tool: "codex",
  });
  const paired = await wake.pair({
    code: code.toLowerCase().replace("-", ""),
    machine: { name: "m", platform: "darwin" },
  });
  expect(paired).toMatchObject({
    app: "acme",
    agent: { id: "agent-1", name: "Claude", tool: "codex" },
  });
  expect(paired.placeKey).toMatch(/^ak_[0-9a-f]{64}$/);
  await expect(wake.pair({ code, machine: { name: "m", platform: "darwin" } })).rejects.toThrow(
    "CODE_INVALID",
  );
  const late = await wake.issueCode({ agent: "agent-1", agentName: "Claude", owner: "ada" });
  advance(10 * 60_000 + 1);
  await expect(
    wake.pair({ code: late.code, machine: { name: "m", platform: "darwin" } }),
  ).rejects.toThrow("CODE_INVALID");
  await expect(wake.pending("ak_nothing-at-all-here")).rejects.toThrow("UNPAIRED");
});

test("the owner's ask is listed without text, claimed once, named, finished by its claimer", async () => {
  const { wake } = await testWake();
  const studio = await pairedKey(wake, "studio");
  const laptop = await pairedKey(wake, "laptop");
  const id = await wake.summon(ask());
  const [one] = await wake.pending(studio);
  expect(one).toEqual({
    id,
    app: "acme",
    kind: "assigned",
    target: ask().target,
    repo: "acme/widgets",
    branch: "acme-1-fix",
    at: expect.any(Number),
  });
  const [won, lost] = await Promise.all([wake.claim(studio, id), wake.claim(laptop, id)]);
  expect([won.claimed, lost.claimed].sort()).toEqual([false, true]);
  const winner = won.claimed ? studio : laptop;
  expect(await wake.pending(winner)).toEqual([]);
  await wake.started(winner, id, { name: "amber-heron", tool: "claude" });
  await wake.started(winner, id, { name: "amber-heron", tool: "claude", session: "04276cdc" });
  const [shown] = await wake.forSubject("ticket-1");
  expect(shown?.state).toBe("claimed");
  expect(shown?.run).toMatchObject({
    name: "amber-heron",
    session: "04276cdc",
    machine: won.claimed ? "studio" : "laptop",
  });
  // Another place's finish, or a second one, changes nothing.
  await wake.finish(won.claimed ? laptop : studio, id, "failed", "nope");
  await wake.finish(winner, id, "done");
  await wake.finish(winner, id, "failed", "late");
  expect((await wake.forSubject("ticket-1"))[0]).toMatchObject({ state: "done" });
});

test("someone else's ask waits for the owner; asking again joins it; no drops it", async () => {
  const { wake } = await testWake();
  const key = await pairedKey(wake);
  const id = await wake.summon(ask({ askedBy: "bo" }));
  expect(await wake.pending(key)).toEqual([]);
  expect(await wake.summon(ask({ askedBy: "ada" }))).toBe(id);
  expect(await wake.pending(key)).toHaveLength(1);
  const other = await wake.summon(ask({ subject: "ticket-2", askedBy: "bo" }));
  await wake.answer({ id: other, yes: false });
  expect((await wake.forSubject("ticket-2"))[0]).toMatchObject({
    state: "dropped",
    reason: "The owner said no.",
  });
});

test("settling drops what waits, never a run under way; half an hour unclaimed says so", async () => {
  const { wake, advance } = await testWake();
  const key = await pairedKey(wake);
  const running = await wake.summon(ask());
  await wake.claim(key, running);
  await wake.summon(ask({ subject: "ticket-2" }));
  expect(await wake.settle({ subject: "ticket-1", state: "dropped", reason: "Closed." })).toBe(0);
  advance(30 * 60_000);
  expect((await wake.forSubject("ticket-2"))[0]?.unclaimed).toBe(true);
  expect(await wake.settle({ subject: "ticket-2", state: "dropped", reason: "Closed." })).toBe(1);
  expect((await wake.forSubject("ticket-2"))[0]).toMatchObject({
    state: "dropped",
    reason: "Closed.",
  });
});

test("a summons Wake would skip is refused when it is made", async () => {
  const { wake } = await testWake();
  await expect(wake.summon(ask({ branch: "../main" }))).rejects.toThrow("INVALID_SUMMONS: branch");
  await expect(
    wake.summon(ask({ target: { kind: "ticket", ref: "A", url: "http://acme.dev" } })),
  ).rejects.toThrow("target.url");
});

test("revoking an agent unpairs its places and drops what waits for it", async () => {
  const { wake } = await testWake();
  const key = await pairedKey(wake);
  const { code } = await wake.issueCode({ agent: "agent-1", agentName: "Claude", owner: "ada" });
  await wake.summon(ask());
  await wake.revokeAgent("agent-1");
  await expect(wake.pending(key)).rejects.toThrow("UNPAIRED");
  await expect(wake.pair({ code, machine: { name: "m", platform: "darwin" } })).rejects.toThrow(
    "CODE_INVALID",
  );
  expect((await wake.forSubject("ticket-1"))[0]).toMatchObject({ state: "dropped" });
});

test("a person's runs, newest first, in a scope; a deleted scope keeps nothing", async () => {
  const { wake, advance } = await testWake();
  const key = await pairedKey(wake);
  await wake.summon(ask());
  advance(1000);
  await wake.summon(ask({ subject: "ticket-2", scope: "w2" }));
  expect((await wake.forOwner({ owner: "ada" })).map((one) => one.subject)).toEqual([
    "ticket-2",
    "ticket-1",
  ]);
  expect((await wake.forOwner({ owner: "ada", scope: "w1" })).map((one) => one.subject)).toEqual([
    "ticket-1",
  ]);
  expect(await wake.places("agent-1")).toHaveLength(1);
  let done = false;
  while (!done) ({ done } = await wake.deleteScope("w1"));
  await expect(wake.pending(key)).rejects.toThrow("UNPAIRED");
  expect(await wake.forOwner({ owner: "ada" })).toHaveLength(1);
});
