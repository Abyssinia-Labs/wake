import { expect, test } from "bun:test";
import { discovery, wakeHandler } from "./handler";
import { ask, testWake } from "./test-db";

const BASE = "https://api.acme.dev/api";

async function setup() {
  const { wake } = await testWake();
  const handle = wakeHandler(wake, { pollMs: 50, pingMs: 30 });
  const call = async (path: string, init: RequestInit & { key?: string } = {}) => {
    const headers = new Headers(init.headers);
    if (init.key) headers.set("authorization", `Bearer ${init.key}`);
    if (init.body) headers.set("content-type", "application/json");
    const res = await handle(new Request(`${BASE}${path}`, { ...init, headers }));
    if (!res) throw new Error(`no route for ${path}`);
    return res;
  };
  const post = (path: string, body: unknown, key?: string) =>
    call(path, { method: "POST", body: JSON.stringify(body), ...(key ? { key } : {}) });
  return { wake, handle, call, post };
}

test("discovery names the HTTP transport", () => {
  expect(discovery({ httpBase: BASE })).toEqual({
    version: "wake/v1",
    transport: "http",
    httpBase: BASE,
  });
});

test("pair, list, claim, start and finish over HTTP, as Wake does", async () => {
  const { wake, call, post } = await setup();
  const { code } = await wake.issueCode({ agent: "agent-1", agentName: "Claude", owner: "ada" });
  const paired = await post("/wake/v1/pair", {
    code,
    machine: { name: "studio", platform: "darwin" },
  });
  expect(paired.status).toBe(200);
  const { placeKey: key } = (await paired.json()) as { placeKey: string };
  const id = await wake.summon(ask());
  const listed = await call("/wake/v1/pending", { key, headers: { accept: "application/json" } });
  expect(((await listed.json()) as { id: string }[]).map((one) => one.id)).toEqual([id]);
  const claimed = await post("/wake/v1/claim", { id }, key);
  expect(await claimed.json()).toEqual({ claimed: true, run: { prompt: ask().prompt } });
  expect((await post("/wake/v1/claim", { id }, key)).status).toBe(200);
  const run = { name: "amber-heron", tool: "claude", session: "s-1" };
  expect((await post("/wake/v1/started", { id, run }, key)).status).toBe(204);
  expect((await post("/wake/v1/finish", { id, outcome: "done" }, key)).status).toBe(204);
  expect((await wake.forSubject("ticket-1"))[0]).toMatchObject({
    state: "done",
    run: { name: "amber-heron" },
  });
  expect((await call("/wake/v1/forget", { method: "POST", key })).status).toBe(204);
  expect((await call("/wake/v1/forget", { method: "POST", key })).status).toBe(401);
});

test("refusals: a key that opens nothing, a wrong body, a code nobody issued", async () => {
  const { handle, call, post } = await setup();
  const nobody = `wk_${"0".repeat(64)}`;
  for (const res of [
    await call("/wake/v1/pending", { key: nobody }),
    await post("/wake/v1/claim", { id: "x" }, nobody),
    await post("/wake/v1/finish", { id: "x", outcome: "failed" }, nobody),
    await post(
      "/wake/v1/started",
      { id: "x", run: { name: "amber-heron", tool: "claude" } },
      nobody,
    ),
  ]) {
    expect(res.status).toBe(401);
    expect(((await res.json()) as { error: string }).error).toBe("unpaired");
  }
  const bad = await post("/wake/v1/pair", {});
  expect([bad.status, ((await bad.json()) as { error: string }).error]).toEqual([
    400,
    "invalid_body",
  ]);
  const wrong = await post("/wake/v1/pair", {
    code: "ZZZZ-ZZZZ",
    machine: { name: "m", platform: "darwin" },
  });
  expect(((await wrong.json()) as { error: string }).error).toBe("code_invalid");
  expect(await handle(new Request(`${BASE}/elsewhere`))).toBeNull();
});

test("pending streams the list at once and again when it changes, with pings", async () => {
  const { wake, call } = await setup();
  const { code } = await wake.issueCode({ agent: "agent-1", agentName: "Claude", owner: "ada" });
  const { placeKey: key } = await wake.pair({ code, machine: { name: "m", platform: "darwin" } });
  const res = await call("/wake/v1/pending", { key, headers: { accept: "text/event-stream" } });
  expect(res.headers.get("content-type")).toBe("text/event-stream");
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
  await until(/event: pending\ndata: \[\]\n\n/);
  const id = await wake.summon(ask());
  await until(new RegExp(`data: \\[\\{"id":"${id}"`));
  await until(/: ping/);
  await reader.cancel();
});
