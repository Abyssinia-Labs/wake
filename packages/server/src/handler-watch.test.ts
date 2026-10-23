// The watch routes over HTTP, as a device calls them: the key as a bearer
// token, runs as server-sent events, 401 for a place key, 402 off the
// plan, and CORS for a browser.
import { describe, expect, test } from "bun:test";
import { wakeHandler, watchLink } from "./handler";
import { ask, pairedKey, STORES, testWake, watchKey } from "./test-db";
import type { Plan } from "./wire";

const BASE = "https://api.acme.dev/api/wake/v1";

for (const kind of STORES) {
  describe(kind, () => {
    async function setup() {
      let plan: Plan = { devices: "included", alerts: "included" };
      const { wake } = await testWake(kind, { plan: () => plan });
      const handle = wakeHandler(wake, { pollMs: 50, pingMs: 30 });
      const call = async (path: string, init: RequestInit & { key?: string } = {}) => {
        const headers = new Headers(init.headers);
        if (init.key) headers.set("authorization", `Bearer ${init.key}`);
        const res = await handle(new Request(`${BASE}/${path}`, { ...init, headers }));
        if (!res) throw new Error(`no route for ${path}`);
        return res;
      };
      const post = (path: string, body: unknown, key?: string) =>
        call(path, { method: "POST", body: JSON.stringify(body), ...(key ? { key } : {}) });
      const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;
      const setPlan = (next: Plan) => {
        plan = next;
      };
      return { wake, call, post, errorOf, setPlan };
    }

    test("a watch code for a key, once, in the spec's shape, with CORS", async () => {
      const { wake, call, post, errorOf } = await setup();
      const { code } = await wake.issueWatchCode({
        agent: "agent-1",
        agentName: "Claude",
        owner: "ada",
      });
      const device = { name: "Firefox", platform: "web" };
      const res = await post("watch", { code, device });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(await res.json()).toEqual({
        watchKey: expect.stringMatching(/^ak_[0-9a-f]{64}$/),
        app: "acme",
        agent: { id: "agent-1", name: "Claude" },
      });
      expect(await errorOf(await post("watch", { code, device }))).toBe("code_invalid");
      for (const body of [{ code }, { code, device: { name: "", platform: "web" } }, { device }]) {
        expect(await errorOf(await post("watch", body))).toBe("invalid_body");
      }
      const preflight = await call("runs", { method: "OPTIONS" });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-headers")).toContain("authorization");
      expect(watchLink("acme.dev", code)).toBe(`wake://watch?domain=acme.dev&code=${code}`);
    });

    test("each watch route refuses a place key, 401 unpaired; forget takes a watch key", async () => {
      const { wake, call, post, errorOf } = await setup();
      const place = await pairedKey(wake);
      const id = await wake.summon(ask());
      for (const res of [
        await call("runs", { key: place }),
        await call("runs", { key: place, headers: { accept: "text/event-stream" } }),
        await call("places", { key: place }),
        await call("watching", { key: place }),
        await post("answer", { id, yes: true }, place),
        await post("push", { kinds: [] }, place),
        await post("activity", { id, pushToken: "ab".repeat(16) }, place),
      ]) {
        expect([res.status, await errorOf(res)]).toEqual([401, "unpaired"]);
        expect(res.headers.get("access-control-allow-origin")).toBe("*");
      }
      const device = await watchKey(wake);
      expect((await post("forget", {}, device)).status).toBe(204);
      expect((await post("forget", {}, device)).status).toBe(401);
    });

    test("off the plan, 402 not-in-plan for all but watching", async () => {
      const { wake, call, post, errorOf, setPlan } = await setup();
      const device = await watchKey(wake);
      const id = await wake.summon(ask());
      setPlan({ devices: "not-in-plan", alerts: "not-in-plan" });
      for (const res of [
        await call("runs", { key: device }),
        await call("runs", { key: device, headers: { accept: "text/event-stream" } }),
        await call("places", { key: device }),
        await post("answer", { id, yes: true }, device),
        await post("push", { kinds: [] }, device),
        await post("activity", { id, pushToken: "ab".repeat(16) }, device),
      ]) {
        expect([res.status, await errorOf(res)]).toEqual([402, "not-in-plan"]);
      }
      const watching = await call("watching", { key: device });
      expect(await watching.json()).toMatchObject({
        devices: "not-in-plan",
        alerts: "not-in-plan",
      });
    });

    test("answer, push and activity: 204, and a body that breaks a rule is invalid_body", async () => {
      const { wake, post, errorOf } = await setup();
      const device = await watchKey(wake);
      const id = await wake.summon(ask({ askedBy: "grace" }));
      expect((await post("answer", { id, yes: true }, device)).status).toBe(204);
      expect((await wake.forSubject("ticket-1"))[0]?.state).toBe("open");
      const apns = { token: "ab".repeat(16), environment: "production" as const };
      expect((await post("push", { kinds: ["ask"], apns }, device)).status).toBe(204);
      expect((await post("activity", { id, pushToken: "cd".repeat(16) }, device)).status).toBe(204);
      expect(await wake.alertTargets({ agent: "agent-1", kind: "ask", summons: id })).toEqual([
        { device: expect.any(String), platform: "ios", apns, activityToken: "cd".repeat(16) },
      ]);
      for (const [path, body] of [
        ["answer", { id }],
        ["push", { kinds: "ask" }],
        ["push", { kinds: ["ask"], apns: { ...apns, environment: "staging" } }],
        ["push", { kinds: ["ask"], webPush: { endpoint: "https://x", keys: {} } }],
        ["activity", { id, pushToken: "not hex" }],
      ] as const) {
        expect(await errorOf(await post(path, body, device))).toBe("invalid_body");
      }
    });

    test("runs streams the list at once and again when it changes", async () => {
      const { wake, call } = await setup();
      const place = await pairedKey(wake);
      const device = await watchKey(wake);
      const res = await call("runs", { key: device, headers: { accept: "text/event-stream" } });
      expect(res.headers.get("content-type")).toBe("text/event-stream");
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      const decoder = new TextDecoder();
      let seen = "";
      const until = async (pattern: RegExp) => {
        while (!pattern.test(seen)) {
          const { value, done } = await reader.read();
          if (done) throw new Error("the stream ended");
          seen += decoder.decode(value, { stream: true });
        }
      };
      await until(/event: runs\ndata: \[\]\n\n/);
      const id = await wake.summon(ask({ askedBy: "grace", askerName: "Grace" }));
      await until(/"state":"asking","asker":\{"name":"Grace"\}/);
      await wake.answer({ id, yes: true });
      await wake.claim(place, id);
      // Wake says the run waits on its owner, over the place's own route.
      const waits = await call("waiting", {
        method: "POST",
        key: place,
        body: JSON.stringify({ id, waiting: true }),
      });
      expect(waits.status).toBe(204);
      await until(/"waiting":true/);
      await reader.cancel();
    });
  });
}
