/// <reference types="vite/client" />

import type { FunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../component/_generated/api.js";
import type { ComponentApi } from "../component/_generated/component.js";
import { hashSecret } from "../component/keys.js";
import schema from "../component/schema.js";
import { handleForget, handlePair } from "./routes.js";

const modules = import.meta.glob("../component/**/*.ts");
// The component's own references stand in for the host's `components.wake`.
const component = api as unknown as ComponentApi;

function harness() {
  const t = convexTest(schema, modules);
  const ctx = {
    runMutation: (ref: FunctionReference<"mutation">, args: Record<string, unknown>) =>
      t.mutation(ref, args),
  } as unknown as Parameters<typeof handlePair>[0];
  return { t, ctx };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://h/wake/v1/pair", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /wake/v1/pair", () => {
  test("a good code answers the key once, in the spec's shape", async () => {
    const { t, ctx } = harness();
    await t.mutation(api.places.storeCode, {
      agent: "agent-1",
      agentName: "Codex",
      owner: "ada",
      tool: "codex",
      codeHash: await hashSecret("K7QD-2M9X"),
      expiresAt: Date.now() + 600_000,
    });
    const res = await handlePair(
      ctx,
      post({ code: "k7qd2m9x", machine: { name: "Ada's Mac", platform: "darwin" } }),
      component,
      { app: "example", keyPrefix: "ex_" },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { placeKey: string };
    expect(body).toEqual({
      placeKey: expect.stringMatching(/^ex_[0-9a-f]{64}$/),
      app: "example",
      agent: { id: "agent-1", name: "Codex", tool: "codex" },
    });
    const again = await handlePair(
      ctx,
      post({ code: "K7QD-2M9X", machine: { name: "x", platform: "darwin" } }),
      component,
      { app: "example" },
    );
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ error: "code_invalid" });
  });

  test("a body that isn't the spec's is refused before anything is looked up", async () => {
    const { ctx } = harness();
    for (const body of ["not json", { code: "K7QD-2M9X" }, { code: 7, machine: {} }]) {
      const res = await handlePair(ctx, post(body), component, { app: "example" });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "invalid_body" });
    }
  });
});

describe("POST /wake/v1/forget", () => {
  test("204 once, then 401; no key is 401", async () => {
    const { t, ctx } = harness();
    await t.mutation(api.places.storeCode, {
      agent: "a",
      agentName: "Claude",
      owner: "o",
      codeHash: await hashSecret("AAAA-BBBB"),
      expiresAt: Date.now() + 600_000,
    });
    const paired = await handlePair(
      ctx,
      post({ code: "AAAA-BBBB", machine: { name: "m", platform: "darwin" } }),
      component,
      { app: "example" },
    );
    const { placeKey } = (await paired.json()) as { placeKey: string };
    const forget = (key?: string) =>
      handleForget(
        ctx,
        new Request("https://h/wake/v1/forget", {
          method: "POST",
          headers: key ? { authorization: `Bearer ${key}` } : {},
        }),
        component,
      );
    expect((await forget(placeKey)).status).toBe(204);
    expect((await forget(placeKey)).status).toBe(401);
    expect((await forget()).status).toBe(401);
  });
});
