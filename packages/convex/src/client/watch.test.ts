/// <reference types="vite/client" />
// The watch calls as a host serves them: `exposeWatchApi`'s public names
// with the host's plan, and `registerRoutes`' watch and forget routes, in a
// small host that registers the component as an app does.
import {
  actionGeneric,
  componentsGeneric,
  httpRouter,
  makeFunctionReference,
  mutationGeneric,
} from "convex/server";
import { v } from "convex/values";
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import type { ComponentApi } from "../component/_generated/component.js";
import schema from "../component/schema.js";
import { exposeApi, type Plan, registerRoutes, Wake } from "./index.js";
import { exposeWatchApi } from "./watch.js";

const components = componentsGeneric() as unknown as { wake: ComponentApi };
const wake = new Wake(components.wake, { app: "example" });
let plan: Plan;
const owner = { agent: "agent-1", agentName: "Claude", owner: "ada", tool: "claude" } as const;
const host = {
  ...exposeApi(components.wake, { app: "example" }),
  ...exposeWatchApi(components.wake, { app: "example", plan: () => plan }),
  watchCode: actionGeneric({
    args: {},
    handler: async (ctx) => (await wake.issueWatchCode(ctx, owner)).code,
  }),
  pairCode: actionGeneric({
    args: {},
    handler: async (ctx) => (await wake.issueCode(ctx, owner)).code,
  }),
  summon: mutationGeneric({
    args: { askedBy: v.string() },
    handler: async (ctx, args) =>
      await wake.summon(ctx, {
        agent: "agent-1",
        owner: "ada",
        askedBy: args.askedBy,
        subject: "ticket-1",
        kind: "assigned",
        target: { kind: "ticket", ref: "ACME-1", url: "https://app.example.com/t/ACME-1" },
        prompt: "Read ACME-1.",
      }),
  }),
};
const http = httpRouter();
registerRoutes(http, components.wake, { app: "example", keyPrefix: "ex_" });
const modules = {
  "./host/_generated/api.ts": async () => ({}),
  "./host/wake.ts": async () => host,
  "./host/http.ts": async () => ({ default: http }),
};

const ref = {
  watchCode: makeFunctionReference<"action", Record<string, never>, string>("wake:watchCode"),
  pairCode: makeFunctionReference<"action", Record<string, never>, string>("wake:pairCode"),
  summon: makeFunctionReference<"mutation", { askedBy: string }, string>("wake:summon"),
  pending: makeFunctionReference<"query", { key: string }, unknown[]>("wake:pending"),
  runs: makeFunctionReference<"query", { key: string }, { state: string }[]>("wake:runs"),
  places: makeFunctionReference<"query", { key: string }, unknown[]>("wake:places"),
  watching: makeFunctionReference<"query", { key: string }, unknown>("wake:watching"),
  answer: makeFunctionReference<"mutation", { key: string; id: string; yes: boolean }>(
    "wake:answer",
  ),
  push: makeFunctionReference<"mutation", { key: string; kinds: string[] }>("wake:push"),
  activity: makeFunctionReference<"mutation", { key: string; id: string; pushToken: string }>(
    "wake:activity",
  ),
};

function setup() {
  const t = convexTest(undefined, modules);
  t.registerComponent("wake", schema, import.meta.glob("../component/**/*.ts"));
  const post = (path: string, body: unknown, key?: string) =>
    t.fetch(`/wake/v1/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
    });
  const watchKey = async (): Promise<string> => {
    const code = await t.action(ref.watchCode, {});
    const res = await post("watch", { code, device: { name: "Ada's iPhone", platform: "ios" } });
    return ((await res.json()) as { watchKey: string }).watchKey;
  };
  const placeKey = async (): Promise<string> => {
    const code = await t.action(ref.pairCode, {});
    const res = await post("pair", { code, machine: { name: "studio", platform: "darwin" } });
    return ((await res.json()) as { placeKey: string }).placeKey;
  };
  return { t, post, watchKey, placeKey };
}

beforeEach(() => {
  plan = { devices: "included", alerts: "not-in-plan" };
});

describe("POST /wake/v1/watch", () => {
  test("a watch code answers a key once, in the spec's shape; a pair code doesn't", async () => {
    const { t, post } = setup();
    const code = await t.action(ref.watchCode, {});
    const device = { name: "Ada's iPhone", platform: "ios" };
    const res = await post("watch", { code: code.toLowerCase().replace("-", ""), device });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({
      watchKey: expect.stringMatching(/^ex_[0-9a-f]{64}$/),
      app: "example",
      agent: { id: "agent-1", name: "Claude", tool: "claude" },
    });
    expect(await (await post("watch", { code, device })).json()).toMatchObject({
      error: "code_invalid",
    });
    const pairCode = await t.action(ref.pairCode, {});
    expect((await post("watch", { code: pairCode, device })).status).toBe(400);
    for (const body of [{ code }, { code, device: { ...device, platform: "android" } }]) {
      expect(await (await post("watch", body)).json()).toMatchObject({ error: "invalid_body" });
    }
  });

  test("a browser may ask first: the routes answer a preflight", async () => {
    const { t } = setup();
    for (const path of ["watch", "forget"]) {
      const res = await t.fetch(`/wake/v1/${path}`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("access-control-allow-headers")).toContain("authorization");
    }
  });

  test("forget closes a watch key or a place key, each once", async () => {
    const { t, post, watchKey, placeKey } = setup();
    for (const key of [await watchKey(), await placeKey()]) {
      expect((await post("forget", {}, key)).status).toBe(204);
      expect((await post("forget", {}, key)).status).toBe(401);
    }
    expect((await t.fetch("/wake/v1/forget", { method: "POST" })).status).toBe(401);
  });
});

describe("the plan", () => {
  test("on a plan with devices, a device answers an ask, and the place sees it", async () => {
    const { t, watchKey, placeKey } = setup();
    const key = await watchKey();
    const place = await placeKey();
    const id = await t.mutation(ref.summon, { askedBy: "grace" });
    expect(await t.query(ref.pending, { key: place })).toEqual([]);
    await t.mutation(ref.answer, { key, id, yes: true });
    expect(await t.query(ref.pending, { key: place })).toHaveLength(1);
    expect((await t.query(ref.runs, { key })).map((one) => one.state)).toEqual(["open"]);
    expect(await t.query(ref.places, { key })).toHaveLength(1);
    expect(await t.query(ref.watching, { key })).toEqual({
      app: "example",
      agent: { id: "agent-1", name: "Claude", tool: "claude" },
      devices: "included",
      alerts: "not-in-plan",
    });
  });

  test("without devices, every watch call but watching is not-in-plan; forget still forgets", async () => {
    const { t, post, watchKey, placeKey } = setup();
    const key = await watchKey();
    const id = await t.mutation(ref.summon, { askedBy: "grace" });
    plan = { devices: "not-in-plan", alerts: "not-in-plan" };
    for (const call of [
      () => t.query(ref.runs, { key }),
      () => t.query(ref.places, { key }),
      () => t.mutation(ref.answer, { key, id, yes: true }),
      () => t.mutation(ref.push, { key, kinds: [] }),
      () => t.mutation(ref.activity, { key, id, pushToken: "ab".repeat(16) }),
    ]) {
      await expect(call()).rejects.toThrow("not-in-plan");
    }
    expect(await t.query(ref.watching, { key })).toMatchObject({ devices: "not-in-plan" });
    // A key that opens nothing is UNPAIRED first, whatever the plan; a place key among them.
    await expect(t.query(ref.runs, { key: await placeKey() })).rejects.toThrow("UNPAIRED");
    await expect(t.query(ref.watching, { key: `ex_${"0".repeat(64)}` })).rejects.toThrow(
      "UNPAIRED",
    );
    expect((await post("forget", {}, key)).status).toBe(204);
    await expect(t.query(ref.watching, { key })).rejects.toThrow("UNPAIRED");
  });
});
