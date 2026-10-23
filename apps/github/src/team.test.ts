// The Team plan end to end (WAK-22, WAK-23): Marketplace sets the plan,
// the org page is its admins' only, a policy refuses what it leaves out,
// and the audit lists the organisation's runs.
import { expect, test } from "bun:test";
import { bench, ORIGIN } from "./plan-bench";

const acme = { id: 100, login: "acme", type: "Organization" };
const repository = { id: 42, full_name: "acme/widgets", owner: acme };
const issue = {
  number: 12,
  title: "Fix it",
  html_url: "https://github.com/acme/widgets/issues/12",
};

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
  const first = await b.hook("issues", labeled);
  expect(first).toMatchObject({ did: "summoned" });
  const summons = String((first as { summons?: string }).summons);
  expect(await b.asks.get(summons)).toMatchObject({
    repo: "acme/widgets",
    number: 12,
    asker: "ada",
  });

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

  // Uninstalling forgets the installation's summonses and which issues they were about.
  expect(
    await b.hook("installation", {
      action: "deleted",
      installation: { id: 5, account: acme },
      sender,
    }),
  ).toEqual({ did: "forgot the installation" });
  expect(await b.asks.get(summons)).toBeNull();
  const after = await (
    await b.bridge(new Request(`${ORIGIN}/org/acme`, { headers: { cookie: ada } }))
  ).text();
  expect(after).toContain("No runs yet.");
});
