/// <reference types="vite/client" />
// wake:push and wake:activity (the spec's "Devices that watch"): where a
// device takes alerts, by its platform's rules, and where the host sends them.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api.js";
import { hashSecret, newPairCode, newPlaceKey } from "./keys.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");
type T = ReturnType<typeof convexTest>;
const hex = "8d3f".repeat(16);

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

describe("alerts", () => {
  test("push takes the device's own way, by its rules, and says where alerts go", async () => {
    const t = convexTest(schema, modules);
    const phone = await watchKey(t, "ios");
    const browser = await watchKey(t, "web");
    const apns = { token: hex, environment: "development" };
    const webPush = {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
      keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
    };
    for (const bad of [
      { key: browser, kinds: ["ask"], apns },
      { key: phone, kinds: ["ask"], webPush },
      { key: phone, kinds: ["ask", "ask"], apns },
      { key: phone, kinds: ["everything"], apns },
    ]) {
      await expect(t.mutation(api.watch.push, bad)).rejects.toThrow("INVALID_BODY");
    }
    await t.mutation(api.watch.push, {
      key: phone,
      kinds: ["failed", "ask"],
      apns,
      liveActivity: { pushToStartToken: hex },
    });
    await t.mutation(api.watch.push, { key: browser, kinds: ["done"], webPush });
    const id = await t.mutation(api.summonses.summon, ask());
    await expect(
      t.mutation(api.watch.activity, { key: phone, id, pushToken: "nope" }),
    ).rejects.toThrow("INVALID_BODY");
    await t.mutation(api.watch.activity, { key: phone, id, pushToken: hex });
    const other = await t.mutation(api.summonses.summon, ask({ agent: "agent-2", subject: "x" }));
    await t.mutation(api.watch.activity, { key: phone, id: other, pushToken: "ab".repeat(16) });
    expect(
      await t.query(api.devices.alertTargets, { agent: "agent-1", kind: "ask", summons: id }),
    ).toEqual([
      {
        device: expect.any(String),
        platform: "ios",
        apns: { token: hex, environment: "development" },
        liveActivity: { pushToStartToken: hex },
        activityToken: hex,
      },
    ]);
    const [done] = await t.query(api.devices.alertTargets, { agent: "agent-1", kind: "done" });
    expect(done).toMatchObject({ platform: "web", webPush });
    const devices = await t.query(api.devices.list, { agent: "agent-1" });
    expect(devices.map((one) => one.alerts)).toEqual([["done"], ["ask", "failed"]]);
  });
});
