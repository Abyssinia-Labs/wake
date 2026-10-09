/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import { hashSecret, KEY_SHAPE, newPairCode, newPlaceKey, normalizeCode } from "./keys.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");
const URL_ = "https://app.example.com/t/ACME-1";

async function paired(t: ReturnType<typeof convexTest>, agent = "agent-1", owner = "ada") {
  const code = newPairCode();
  await t.mutation(api.places.storeCode, {
    agent,
    agentName: "Claude",
    owner,
    tool: "claude",
    codeHash: await hashSecret(code),
    expiresAt: Date.now() + 600_000,
  });
  const key = newPlaceKey("ex_");
  const answer = await t.mutation(api.places.pair, {
    codeHash: await hashSecret(normalizeCode(code.toLowerCase().replace("-", ""))),
    keyHash: await hashSecret(key),
    machine: "Ada's Mac",
    platform: "darwin",
  });
  return { key, code, answer };
}

function ask(over: Record<string, unknown> = {}) {
  return {
    agent: "agent-1",
    owner: "ada",
    askedBy: "ada",
    subject: "ticket-1",
    kind: "assigned",
    target: { kind: "ticket", ref: "ACME-1", url: URL_ },
    repo: "acme/widgets",
    branch: "acme-1-fix",
    prompt: "Read ACME-1 with getticket, then do what it asks.",
    ...over,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("secrets", () => {
  test("codes and keys have the spec's shapes", () => {
    const code = newPairCode();
    expect(code).toMatch(/^[A-HJKMNP-TV-Z2-9]{4}-[A-HJKMNP-TV-Z2-9]{4}$/);
    expect(normalizeCode(code.toLowerCase().replace("-", " "))).toBe(code);
    const key = newPlaceKey("gwk_");
    expect(key).toMatch(/^gwk_[0-9a-f]{64}$/);
    expect(KEY_SHAPE.test(key)).toBe(true);
  });
});

describe("pairing", () => {
  test("a code makes one place, once; the answer names the agent and its tool", async () => {
    const t = convexTest(schema, modules);
    const { code, answer } = await paired(t);
    expect(answer).toEqual({ agent: "agent-1", agentName: "Claude", tool: "claude" });
    await expect(
      t.mutation(api.places.pair, {
        codeHash: await hashSecret(code),
        keyHash: "x",
        machine: "m",
        platform: "darwin",
      }),
    ).rejects.toThrow("CODE_INVALID");
    expect(await t.query(api.places.list, { agent: "agent-1" })).toHaveLength(1);
  });

  test("an expired code makes nothing", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.places.storeCode, {
      agent: "a",
      agentName: "Claude",
      owner: "o",
      codeHash: await hashSecret("AAAA-BBBB"),
      expiresAt: Date.now() - 1,
    });
    await expect(
      t.mutation(api.places.pair, {
        codeHash: await hashSecret("AAAA-BBBB"),
        keyHash: "k",
        machine: "m",
        platform: "darwin",
      }),
    ).rejects.toThrow("CODE_INVALID");
  });
});

describe("a summons's life", () => {
  test("the owner's ask is listed, without text, claimed once, finished by its claimer", async () => {
    const t = convexTest(schema, modules);
    const one = await paired(t);
    const two = await paired(t);
    const id = await t.mutation(api.summonses.summon, ask());
    const listed = await t.query(api.wire.pending, { key: one.key, app: "example" });
    expect(listed).toEqual([
      {
        id,
        app: "example",
        kind: "assigned",
        target: { kind: "ticket", ref: "ACME-1", url: URL_ },
        repo: "acme/widgets",
        branch: "acme-1-fix",
        at: expect.any(Number),
      },
    ]);
    expect(JSON.stringify(listed)).not.toContain("getticket");
    expect(await t.mutation(api.wire.claim, { key: one.key, id })).toEqual({
      claimed: true,
      run: { prompt: ask().prompt },
    });
    expect(await t.mutation(api.wire.claim, { key: two.key, id })).toEqual({ claimed: false });
    // Only the claimer finishes it.
    await t.mutation(api.wire.finish, { key: two.key, id, outcome: "failed", reason: "no" });
    await t.mutation(api.wire.finish, { key: one.key, id, outcome: "done" });
    const [row] = await t.query(api.summonses.forSubject, { subject: "ticket-1" });
    expect(row?.state).toBe("done");
    expect(await t.query(api.wire.pending, { key: one.key, app: "example" })).toEqual([]);
  });

  test("someone else's ask waits for the owner; asking again joins it", async () => {
    const t = convexTest(schema, modules);
    const { key } = await paired(t);
    const id = await t.mutation(api.summonses.summon, ask({ askedBy: "bob" }));
    expect(await t.query(api.wire.pending, { key, app: "example" })).toEqual([]);
    expect(await t.mutation(api.summonses.summon, ask({ askedBy: "bob" }))).toBe(id);
    await t.mutation(api.summonses.answer, { id, yes: true });
    expect(await t.query(api.wire.pending, { key, app: "example" })).toHaveLength(1);
  });

  test("settling drops what waits, never a run under way", async () => {
    const t = convexTest(schema, modules);
    const { key } = await paired(t);
    const claimed = await t.mutation(api.summonses.summon, ask());
    await t.mutation(api.wire.claim, { key, id: claimed });
    await t.mutation(api.summonses.summon, ask({ agent: "agent-2", owner: "bob", askedBy: "bob" }));
    const ended = await t.mutation(api.summonses.settle, {
      subject: "ticket-1",
      state: "dropped",
      reason: "Closed.",
    });
    expect(ended).toBe(1);
    const rows = await t.query(api.summonses.forSubject, { subject: "ticket-1" });
    expect(rows.map((row) => row.state).sort()).toEqual(["claimed", "dropped"]);
  });

  test("unclaimed for half an hour, it says so, and stays open", async () => {
    vi.useFakeTimers();
    const t = convexTest(schema, modules);
    await t.mutation(api.summonses.summon, ask());
    vi.advanceTimersByTime(31 * 60_000);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const [row] = await t.query(api.summonses.forSubject, { subject: "ticket-1" });
    expect(row).toMatchObject({ state: "open", unclaimed: true });
  });

  test("a summons Wake would skip is refused when it is made", async () => {
    const t = convexTest(schema, modules);
    const bad = [
      ask({ target: { kind: "ticket", ref: "ACME\u001b[2J", url: URL_ } }),
      ask({ target: { kind: "ticket", ref: "ACME-1", url: "javascript:alert(1)" } }),
      ask({ branch: "../main" }),
      ask({ branch: undefined }),
      ask({ kind: "Assigned!" }),
      ask({ prompt: " " }),
    ];
    for (const one of bad) {
      await expect(t.mutation(api.summonses.summon, one)).rejects.toThrow("INVALID_SUMMONS");
    }
  });
});

describe("keys that open nothing", () => {
  test("unknown, forgotten, revoked: UNPAIRED; revoking drops what waits", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.wire.pending, { key: newPlaceKey(), app: "example" })).rejects.toThrow(
      "UNPAIRED",
    );
    await expect(t.query(api.wire.pending, { key: "short", app: "example" })).rejects.toThrow(
      "UNPAIRED",
    );
    const one = await paired(t);
    expect(await t.mutation(api.places.forget, { keyHash: await hashSecret(one.key) })).toBe(true);
    await expect(t.query(api.wire.pending, { key: one.key, app: "example" })).rejects.toThrow(
      "UNPAIRED",
    );
    const two = await paired(t);
    await t.mutation(api.summonses.summon, ask());
    await t.mutation(api.places.revokeAgent, { agent: "agent-1" });
    await expect(t.query(api.wire.pending, { key: two.key, app: "example" })).rejects.toThrow(
      "UNPAIRED",
    );
    const [row] = await t.query(api.summonses.forSubject, { subject: "ticket-1" });
    expect(row?.state).toBe("dropped");
  });
});
