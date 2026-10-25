// Adding a device: a code only for the owner signed in, only on Pro; the
// device takes it over wake/v1's watch call and shows on the page; its key
// answers while the plan includes devices, and forgetting it ends it.
import { expect, test } from "bun:test";
import { bench, ORIGIN } from "./plan-bench";

const ada = { id: 7, login: "ada" };

async function devices(b: Awaited<ReturnType<typeof bench>>, cookie: string, form?: object) {
  return await b.bridge(
    new Request(`${ORIGIN}/devices`, {
      ...(form ? { method: "POST", body: new URLSearchParams({ ...form }) } : {}),
      headers: { cookie, ...(form ? { origin: ORIGIN } : {}) },
      redirect: "manual",
    }),
  );
}

async function watch(b: Awaited<ReturnType<typeof bench>>, code: string) {
  const res = await b.bridge(
    new Request(`${ORIGIN}/api/wake/v1/watch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, device: { name: "Ada's iPhone", platform: "ios" } }),
    }),
  );
  return { status: res.status, body: (await res.json()) as { watchKey?: string } };
}

const watching = (b: Awaited<ReturnType<typeof bench>>, key: string, route = "watching") =>
  b.bridge(
    new Request(`${ORIGIN}/api/wake/v1/${route}`, { headers: { authorization: `Bearer ${key}` } }),
  );

test("the page is for someone signed in", async () => {
  const b = await bench();
  const res = await b.bridge(new Request(`${ORIGIN}/devices`, { redirect: "manual" }));
  expect(res.status).toBe(303);
  expect(res.headers.get("location")).toBe(`${ORIGIN}/auth/login`);
});

test("on Free the page offers Pro and makes no code", async () => {
  const b = await bench();
  const cookie = await b.as(ada);
  const page = await (await devices(b, cookie)).text();
  expect(page).toContain("Devices come with <strong>Pro</strong>");
  expect(page).not.toContain("<button>Get a code</button>");
  const asked = await devices(b, cookie, { action: "add", tool: "claude" });
  expect(asked.status).toBe(402);
  expect(await asked.text()).not.toContain("<pre>");
});

test("a form from elsewhere is refused", async () => {
  const b = await bench();
  const res = await b.bridge(
    new Request(`${ORIGIN}/devices`, {
      method: "POST",
      headers: { cookie: await b.as(ada), origin: "https://evil.example" },
      body: new URLSearchParams({ action: "add", tool: "claude" }),
    }),
  );
  expect(res.status).toBe(403);
});

test("on Pro a code adds a device, the plan answers at each call, and forgetting ends it", async () => {
  const b = await bench();
  await b.kv.set("plan:7", { name: "pro", source: "granted" });
  const cookie = await b.as(ada);

  const page = await (await devices(b, cookie, { action: "add", tool: "claude" })).text();
  const code = page.match(/<pre>([^<]+)<\/pre>/)?.[1];
  expect(code).toBeDefined();
  expect(page).toContain("wake://watch?domain=github.wakectl.dev&amp;code=");

  const added = await watch(b, code ?? "");
  expect(added.status).toBe(200);
  const key = added.body.watchKey ?? "";
  expect(key.startsWith("ghw_")).toBe(true);
  // A code works once.
  expect((await watch(b, code ?? "")).status).not.toBe(200);

  const listed = await (await devices(b, cookie)).text();
  expect(listed).toContain("Ada&#39;s iPhone");
  expect(listed).toContain("iPhone, added");
  const answer = (await (await watching(b, key)).json()) as { devices: string; alerts: string };
  expect(answer.devices).toBe("included");
  expect((await watching(b, key, "places")).status).toBe(200);

  // Back on Free: the key still says what the plan includes, and nothing else.
  await b.kv.set("plan:7", { name: "free", source: "none" });
  expect(((await (await watching(b, key)).json()) as { devices: string }).devices).toBe(
    "not-in-plan",
  );
  expect((await watching(b, key, "places")).status).toBe(402);

  await b.kv.set("plan:7", { name: "pro", source: "granted" });
  const id = listed.match(/name="device" value="([^"]+)"/)?.[1] ?? "";
  const forgot = await devices(b, cookie, { action: "forget", tool: "claude", device: id });
  expect(forgot.status).toBe(303);
  expect(await (await devices(b, cookie)).text()).not.toContain("Ada&#39;s iPhone");
  expect((await watching(b, key)).status).toBe(401);
});
