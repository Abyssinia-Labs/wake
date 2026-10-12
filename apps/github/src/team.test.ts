// The Team plan end to end (WAK-22, WAK-23): Marketplace sets the plan,
// the org page is its admins' only, a policy refuses what it leaves out,
// and the audit lists the organisation's runs.
import { expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { drizzleStore, WAKE_TABLES_SQL } from "@abyssinia-labs/wake-server/drizzle";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { type BridgeConfig, createBridge } from "./app";
import { asksIn, GITHUB_TABLES_SQL } from "./db";
import { GITHUB_KV_SQL, kvInPg } from "./kv";
import { sessionCookie } from "./session";
import { signatureOf } from "./signature";

const ORIGIN = "https://github.wakectl.dev";
const config: BridgeConfig = {
  origin: ORIGIN,
  appId: "1",
  appSlug: "wake",
  privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs1", format: "pem" })
    .toString(),
  webhookSecret: "hooks",
  marketplaceSecret: "market",
  clientId: "c",
  clientSecret: "s",
  sessionSecret: "sessions",
};
const acme = { id: 100, login: "acme", type: "Organization" };
const repository = { id: 42, full_name: "acme/widgets", owner: acme };
const issue = {
  number: 12,
  title: "Fix it",
  html_url: "https://github.com/acme/widgets/issues/12",
};

async function bench() {
  const client = new PGlite();
  await client.exec(WAKE_TABLES_SQL + GITHUB_TABLES_SQL + GITHUB_KV_SQL);
  const github: { method: string; path: string; body?: unknown }[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const call = {
      method: init?.method ?? "GET",
      path: url.pathname,
      ...(typeof init?.body === "string" ? { body: JSON.parse(init.body) } : {}),
    };
    github.push(call);
    if (url.pathname.endsWith("/access_tokens"))
      return Response.json({
        token: "t",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });
    if (url.pathname.endsWith("/permission")) return Response.json({ permission: "write" });
    if (url.pathname.startsWith("/orgs/acme/memberships/")) {
      const role = url.pathname.endsWith("/ada") ? "admin" : "member";
      return Response.json({ role, state: "active" });
    }
    if (call.method === "POST" && url.pathname.endsWith("/comments"))
      return Response.json({ id: 99 }, { status: 201 });
    return new Response(null, { status: 200 });
  };
  const db = drizzle(client);
  const kv = kvInPg(db);
  const bridge = createBridge(
    { store: drizzleStore(db), asks: asksIn(db), kv },
    config,
    fake as typeof fetch,
  );
  const hook = async (event: string, payload: object, secret = config.webhookSecret) => {
    const body = JSON.stringify(payload);
    const res = await bridge(
      new Request(`${ORIGIN}/github/webhook`, {
        method: "POST",
        headers: {
          "x-github-event": event,
          "x-hub-signature-256": await signatureOf(secret, body),
        },
        body,
      }),
    );
    return (await res.json()) as { did: string };
  };
  const as = async (who: { id: number; login: string }) =>
    (await sessionCookie(config.sessionSecret, who)).split(";")[0] ?? "";
  return { bridge, hook, as, kv, github };
}

const purchase = (action: string, plan: { name: string; monthly_price_in_cents: number }) => ({
  action,
  marketplace_purchase: { account: acme, plan, unit_count: 5, on_free_trial: false },
});

test("Marketplace sets the plan, signed with the listing's own secret; a cancellation ends it", async () => {
  const b = await bench();
  expect(
    await b.hook(
      "marketplace_purchase",
      purchase("purchased", { name: "Team", monthly_price_in_cents: 1900 }),
      "market",
    ),
  ).toEqual({ did: "plan: acme on team" });
  expect(await b.kv.get("plan:100")).toMatchObject({
    name: "team",
    source: "marketplace",
    units: 5,
  });
  expect(
    await b.hook(
      "marketplace_purchase",
      purchase("pending_change", { name: "Free", monthly_price_in_cents: 0 }),
      "market",
    ),
  ).toEqual({ did: "noted: pending_change" });
  expect(
    await b.hook(
      "marketplace_purchase",
      purchase("cancelled", { name: "Team", monthly_price_in_cents: 1900 }),
      "market",
    ),
  ).toEqual({ did: "plan: acme on free" });
});

test("the org page is its admins' only; on Free it says what Team adds", async () => {
  const b = await bench();
  await b.hook("issues", {
    action: "opened",
    installation: { id: 5, account: acme },
    repository,
    sender: { id: 7, login: "ada", type: "User" },
    issue,
  });
  const page = (who: string) =>
    b.bridge(new Request(`${ORIGIN}/org/acme`, { headers: { cookie: who } }));
  expect((await b.bridge(new Request(`${ORIGIN}/org/acme`))).status).toBe(303);
  expect((await page(await b.as({ id: 8, login: "bo" }))).status).toBe(403);
  const free = await (await page(await b.as({ id: 7, login: "ada" }))).text();
  expect(free).toContain("On <strong>Free</strong>");
  expect(free).toContain("Team</strong> adds");
});

test("on Team, admins set a policy, it refuses what it leaves out, and the audit lists runs", async () => {
  const b = await bench();
  await b.hook("installation", {
    action: "created",
    installation: { id: 5, account: acme },
    sender: { id: 7, login: "ada", type: "User" },
  });
  await b.kv.set("plan:100", { name: "team", source: "granted" });
  const ada = await b.as({ id: 7, login: "ada" });
  // Pair ada's Claude Code through the page, so a summons has an agent to wake.
  const paired = await b.bridge(
    new Request(`${ORIGIN}/pair`, {
      method: "POST",
      headers: { cookie: ada, origin: ORIGIN },
      body: new URLSearchParams({ tool: "claude" }),
    }),
  );
  const code = (await paired.text()).match(/([A-Z0-9]{4}-[A-Z0-9]{4})/)?.[1];
  await b.bridge(
    new Request(`${ORIGIN}/api/wake/v1/pair`, {
      method: "POST",
      body: JSON.stringify({ code, machine: { name: "m", platform: "linux" } }),
    }),
  );

  const sender = { id: 7, login: "ada", type: "User" };
  const labeled = {
    action: "labeled",
    label: { name: "wake" },
    installation: { id: 5 },
    repository,
    sender,
    issue,
  };
  expect(await b.hook("issues", labeled)).toMatchObject({ did: "summoned" });

  const saved = await b.bridge(
    new Request(`${ORIGIN}/org/acme`, {
      method: "POST",
      headers: { cookie: ada, origin: ORIGIN },
      body: new URLSearchParams({ repos: "acme/other", who: "push" }),
    }),
  );
  expect(saved.status).toBe(303);
  expect(await b.kv.get("policy:100")).toEqual({
    repos: ["acme/other"],
    who: "push",
    updatedBy: "ada",
  });

  expect(await b.hook("issues", { ...labeled, issue: { ...issue, number: 13 } })).toEqual({
    did: "refused: policy",
  });
  expect(JSON.stringify(b.github.at(-1)?.body)).toContain("doesn't include acme/widgets");

  const page = await (
    await b.bridge(new Request(`${ORIGIN}/org/acme`, { headers: { cookie: ada } }))
  ).text();
  expect(page).toContain("On <strong>Team</strong> (granted)");
  expect(page).toContain("acme/widgets#12");
  expect(page).toContain("@ada");
  expect(page).toContain("acme/other</textarea>");
});
