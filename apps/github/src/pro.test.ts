// The Pro plan (WAK-22): a personal account's, set by a Marketplace listing
// named Pro or granted by hand, with none of Team's: no policy, no audit,
// and no policy held against a summons.
import { expect, test } from "bun:test";
import { bench, ORIGIN } from "./plan-bench";
import { nameOfListing, planOf } from "./plans";

const ada = { id: 7, login: "ada", type: "User" };
const acme = { id: 100, login: "acme", type: "Organization" };
const notes = { id: 43, full_name: "ada/notes", owner: ada };
const issue = { number: 3, title: "Tidy up", html_url: "https://github.com/ada/notes/issues/3" };

test("Marketplace listings map by name: Pro, Team, and any other paid one is Team", () => {
  const listing = (name: string, cents: number) =>
    nameOfListing({ name, monthly_price_in_cents: cents });
  expect(listing("Pro", 800)).toBe("pro");
  expect(listing("Wake Pro", 800)).toBe("pro");
  expect(listing("Team", 1900)).toBe("team");
  expect(listing("Projects", 1200)).toBe("team");
  expect(listing("Business", 4900)).toBe("team");
  expect(listing("Free", 0)).toBe("free");
});

test("buying Pro sets it on the person's own account, and cancelling ends it", async () => {
  const b = await bench();
  const bought = (action: string) => ({
    action,
    marketplace_purchase: {
      account: ada,
      billing_cycle: "yearly",
      plan: { name: "Pro", monthly_price_in_cents: 800, yearly_price_in_cents: 8000 },
      unit_count: 1,
      on_free_trial: false,
    },
  });
  expect(await b.hook("marketplace_purchase", bought("purchased"), "market")).toEqual({
    did: "plan: ada on pro",
  });
  expect(await planOf(b.kv, 7)).toEqual({ name: "pro", source: "marketplace", units: 1 });
  expect(await b.hook("marketplace_purchase", bought("cancelled"), "market")).toEqual({
    did: "plan: ada on free",
  });
});

test("a granted Pro has its page, with no policy or audit, and can't save one", async () => {
  const b = await bench();
  await b.hook("installation", {
    action: "created",
    installation: { id: 6, account: ada },
    sender: ada,
  });
  const cookie = await b.as(ada);
  const page = async () =>
    (await b.bridge(new Request(`${ORIGIN}/org/ada`, { headers: { cookie } }))).text();
  const free = await page();
  expect(free).toContain("On <strong>Free</strong>");
  expect(free).toContain("<strong>Pro</strong>, for your own account, adds");
  expect(free).toContain("$8 a month or $80 a year");

  await b.kv.set("plan:7", { name: "pro", source: "granted" });
  expect(await planOf(b.kv, 7)).toEqual({ name: "pro", source: "granted" });
  const pro = await page();
  expect(pro).toContain("On <strong>Pro</strong> (granted)");
  expect(pro).not.toContain("for your own account, adds");
  expect(pro).not.toContain("<h2>Policy</h2>");
  expect(pro).not.toContain("<h2>Audit</h2>");
  const saved = await b.bridge(
    new Request(`${ORIGIN}/org/ada`, {
      method: "POST",
      headers: { cookie, origin: ORIGIN },
      body: new URLSearchParams({ repos: "ada/other", who: "admins" }),
    }),
  );
  expect(saved.status).toBe(402);
  expect(await b.kv.get("policy:7")).toBeNull();
});

test("an organisation holding Pro gets Free's page and Team's offer, not Team's", async () => {
  const b = await bench();
  await b.hook("installation", {
    action: "created",
    installation: { id: 5, account: acme },
    sender: ada,
  });
  await b.kv.set("plan:100", { name: "pro", source: "granted" });
  const page = await (
    await b.bridge(new Request(`${ORIGIN}/org/acme`, { headers: { cookie: await b.as(ada) } }))
  ).text();
  expect(page).toContain("Pro is for a personal account");
  expect(page).toContain("<strong>Team</strong> adds");
  expect(page).not.toContain("<h2>Policy</h2>");
});

test("a policy kept for a Pro account doesn't hold its summons; on Team it does", async () => {
  const b = await bench();
  await b.kv.set("plan:7", { name: "pro", source: "granted" });
  await b.kv.set("policy:7", { repos: ["ada/other"], who: "push" });
  const labeled = {
    action: "labeled",
    label: { name: "wake" },
    installation: { id: 6 },
    repository: notes,
    sender: ada,
    issue,
  };
  // Past the policy, to the next check: ada hasn't paired.
  expect(await b.hook("issues", labeled)).toEqual({ did: "refused: not paired" });
  await b.kv.set("plan:7", { name: "team", source: "granted" });
  expect(await b.hook("issues", labeled)).toEqual({ did: "refused: policy" });
});
