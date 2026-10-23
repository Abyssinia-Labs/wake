/// <reference types="vite/client" />
// The watch calls (the spec's "Devices that watch"), in the component: a
// watch key opens only them, a place key none of them, and what a device
// sees carries no text.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { hashSecret, newPairCode, newPlaceKey } from "./keys.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");
type T = ReturnType<typeof convexTest>;
const hex = "8d3f".repeat(16);

async function placeKey(t: T, machine = "Ada's Mac", agent = "agent-1"): Promise<string> {
  const code = newPairCode();
  await t.mutation(api.places.storeCode, {
    agent,
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

async function watchKey(
  t: T,
  platform: "ios" | "darwin" | "web" = "ios",
  agent = "agent-1",
): Promise<string> {
  const code = newPairCode();
  await t.mutation(api.devices.storeCode, {
    agent,
    agentName: "Claude",
    owner: "ada",
    scope: "w1",
    tool: "claude",
    codeHash: await hashSecret(code),
    expiresAt: Date.now() + 600_000,
  });
  const key = newPlaceKey("ex_");
  await t.mutation(api.devices.watch, {
    codeHash: await hashSecret(code),
    keyHash: await hashSecret(key),
    name: "Ada's iPhone",
    platform,
  });
  return key;
}

const ask = (over: Record<string, unknown> = {}) => ({
  agent: "agent-1",
  owner: "ada",
  askedBy: "grace",
  askerName: "Grace",
  subject: "ticket-1",
  kind: "assigned",
  target: { kind: "ticket", ref: "ACME-1", url: "https://app.example.com/t/ACME-1" },
  repo: "acme/widgets",
  branch: "acme-1-fix",
  prompt: "Read ACME-1 with getticket, then do what it asks.",
  ...over,
});

describe("keys", () => {
  test("a watch code makes one device, and opens no place's door, nor a pair code a device's", async () => {
    const t = convexTest(schema, modules);
    const code = newPairCode();
    await t.mutation(api.devices.storeCode, {
      agent: "agent-1",
      agentName: "Claude",
      owner: "ada",
      codeHash: await hashSecret(code),
      expiresAt: Date.now() + 600_000,
    });
    const pairing = { codeHash: await hashSecret(code), keyHash: "k", platform: "darwin" };
    await expect(t.mutation(api.places.pair, { ...pairing, machine: "m" })).rejects.toThrow(
      "CODE_INVALID",
    );
    const watching = { codeHash: await hashSecret(code), keyHash: "k", name: "Phone" };
    expect(await t.mutation(api.devices.watch, { ...watching, platform: "ios" })).toEqual({
      agent: "agent-1",
      agentName: "Claude",
    });
    await expect(t.mutation(api.devices.watch, { ...watching, platform: "ios" })).rejects.toThrow(
      "CODE_INVALID",
    );
    const place = newPairCode();
    await t.mutation(api.places.storeCode, {
      agent: "agent-1",
      agentName: "Claude",
      owner: "ada",
      codeHash: await hashSecret(place),
      expiresAt: Date.now() + 600_000,
    });
    await expect(
      t.mutation(api.devices.watch, {
        ...watching,
        codeHash: await hashSecret(place),
        platform: "web",
      }),
    ).rejects.toThrow("CODE_INVALID");
  });

  test("a place key opens no watch call, and a watch key no place call", async () => {
    const t = convexTest(schema, modules);
    const place = await placeKey(t);
    const device = await watchKey(t);
    const id = await t.mutation(api.summonses.summon, ask({ askedBy: "ada" }));
    for (const call of [
      () => t.query(api.watch.device, { key: place }),
      () => t.query(api.watch.runs, { key: place, app: "example" }),
      () => t.query(api.watch.places, { key: place }),
      () => t.mutation(api.watch.answer, { key: place, id, yes: true }),
      () =>
        t.mutation(api.watch.push, {
          key: place,
          kinds: ["ask"],
          apns: { token: hex, environment: "production" },
        }),
      () => t.mutation(api.watch.activity, { key: place, id, pushToken: hex }),
      () => t.query(api.wire.pending, { key: device, app: "example" }),
      () => t.mutation(api.wire.claim, { key: device, id }),
      () =>
        t.mutation(api.wire.started, {
          key: device,
          id,
          run: { name: "amber-heron", tool: "claude" },
        }),
      () => t.mutation(api.wire.waiting, { key: device, id, waiting: true }),
      () => t.mutation(api.wire.finish, { key: device, id, outcome: "failed" }),
    ]) {
      await expect(call()).rejects.toThrow("UNPAIRED");
    }
  });

  test("forgetting, removing or revoking closes a watch key; a scope's delete takes its devices", async () => {
    const t = convexTest(schema, modules);
    const one = await watchKey(t);
    expect(await t.mutation(api.devices.forget, { keyHash: await hashSecret(one) })).toBe(true);
    expect(await t.mutation(api.devices.forget, { keyHash: await hashSecret(one) })).toBe(false);
    await expect(t.query(api.watch.device, { key: one })).rejects.toThrow("UNPAIRED");
    const two = await watchKey(t);
    const [listed] = await t.query(api.devices.list, { agent: "agent-1" });
    expect(listed).toMatchObject({ name: "Ada's iPhone", platform: "ios", alerts: [] });
    expect(
      await t.mutation(api.devices.remove, { agent: "agent-2", device: listed?.id ?? "" }),
    ).toBe(false);
    expect(
      await t.mutation(api.devices.remove, { agent: "agent-1", device: listed?.id ?? "" }),
    ).toBe(true);
    await expect(t.query(api.watch.device, { key: two })).rejects.toThrow("UNPAIRED");
    const three = await watchKey(t);
    await t.mutation(api.places.revokeAgent, { agent: "agent-1" });
    await expect(t.query(api.watch.device, { key: three })).rejects.toThrow("UNPAIRED");
    expect(await t.mutation(api.scopes.deleteScope, { scope: "w1" })).toEqual({
      deleted: 6,
      done: true,
    });
  });
});

describe("what a device sees", () => {
  test("an ask is the owner's to answer: invisible to places until a yes", async () => {
    const t = convexTest(schema, modules);
    const place = await placeKey(t);
    const device = await watchKey(t);
    const other = await watchKey(t, "ios", "agent-2");
    const id = await t.mutation(api.summonses.summon, ask());
    expect(await t.query(api.wire.pending, { key: place, app: "example" })).toEqual([]);
    expect(await t.mutation(api.wire.claim, { key: place, id })).toEqual({ claimed: false });
    const [asking] = await t.query(api.watch.runs, { key: device, app: "example" });
    expect(asking).toMatchObject({ id, state: "asking", asker: { name: "Grace" } });
    // Another agent's device can't say yes for this one.
    await t.mutation(api.watch.answer, { key: other, id, yes: true });
    expect(await t.query(api.wire.pending, { key: place, app: "example" })).toEqual([]);
    await t.mutation(api.watch.answer, { key: device, id, yes: true });
    expect(await t.query(api.wire.pending, { key: place, app: "example" })).toHaveLength(1);
    const [open] = await t.query(api.watch.runs, { key: device, app: "example" });
    expect(open?.state).toBe("open");
    expect(open?.asker).toBeUndefined();
    const no = await t.mutation(api.summonses.summon, ask({ subject: "ticket-2" }));
    await t.mutation(api.watch.answer, { key: device, id: no, yes: false });
    const [dropped] = await t.query(api.watch.runs, { key: device, app: "example" });
    expect(dropped).toMatchObject({ id: no, state: "dropped", reason: "The owner said no." });
    expect(dropped?.endedAt).toEqual(expect.any(Number));
  });

  test("a run, newest first, with its place, its wait and its end; no prompt, no machine path", async () => {
    const t = convexTest(schema, modules);
    const place = await placeKey(t, "Ada's\u001b[2J Mac");
    const device = await watchKey(t);
    const id = await t.mutation(api.summonses.summon, ask({ askedBy: "ada" }));
    await t.mutation(api.wire.claim, { key: place, id });
    await t.mutation(api.wire.started, {
      key: place,
      id,
      run: { name: "amber-heron", tool: "claude", session: "s-1" },
    });
    await t.mutation(api.wire.waiting, { key: place, id, waiting: true });
    const later = await t.mutation(api.summonses.summon, ask({ subject: "ticket-2" }));
    const [first, second] = await t.query(api.watch.runs, { key: device, app: "example" });
    expect(first?.id).toBe(later);
    expect(second).toEqual({
      id,
      app: "example",
      kind: "assigned",
      target: ask().target,
      repo: "acme/widgets",
      branch: "acme-1-fix",
      at: expect.any(Number),
      state: "claimed",
      run: { name: "amber-heron", tool: "claude", session: "s-1", startedAt: expect.any(Number) },
      place: { name: "Ada's[2J Mac" },
      waiting: true,
    });
    const [shown] = await t.query(api.summonses.forSubject, { subject: "ticket-1" });
    expect(shown?.waiting).toBe(true);
    await t.mutation(api.wire.finish, {
      key: place,
      id,
      outcome: "done",
      reason: "Opened a pull request.",
    });
    const runs = await t.query(api.watch.runs, { key: device, app: "example" });
    expect(runs[1]).toMatchObject({ state: "done", reason: "Opened a pull request." });
    expect(runs[1]?.waiting).toBeUndefined();
    expect(JSON.stringify(runs)).not.toContain("getticket");
  });

  test("places: not forgotten, newest first, with their last claim", async () => {
    const t = convexTest(schema, modules);
    const studio = await placeKey(t, "studio");
    const laptop = await placeKey(t, "laptop");
    const gone = await placeKey(t, "gone");
    await t.mutation(api.places.forget, { keyHash: await hashSecret(gone) });
    const device = await watchKey(t);
    const id = await t.mutation(api.summonses.summon, ask({ askedBy: "ada" }));
    await t.mutation(api.wire.claim, { key: studio, id });
    const places = await t.query(api.watch.places, { key: device });
    expect(places.map((one) => one.name)).toEqual(["laptop", "studio"]);
    expect(places[0]?.lastClaimAt).toBeUndefined();
    expect(places[1]).toEqual({
      name: "studio",
      platform: "darwin",
      pairedAt: expect.any(Number),
      lastClaimAt: expect.any(Number),
    });
    expect(laptop).not.toBe(studio);
  });
});
