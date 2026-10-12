// A GitHub account's plan (WAK-22): Free, or Team, which adds the org
// policy and the audit (and, later, cloud fallback). It is set by GitHub
// Marketplace's `marketplace_purchase` events, or granted by the owner
// until the app can sell on Marketplace (a verified publisher, about a
// hundred installations): see the README, "Plans".
import type { Kv } from "./kv";
import { num, type Obj, obj, str } from "./payload";

export type PlanName = "free" | "team";
export type Plan = {
  name: PlanName;
  source: "marketplace" | "granted" | "none";
  /** Seats or units bought, when the plan counts them. */
  units?: number;
  trialEnds?: string;
};

export type Account = {
  id: number;
  login: string;
  type: "Organization" | "User";
  installation?: number;
};

const FREE: Plan = { name: "free", source: "none" };

export async function planOf(kv: Kv, account: number): Promise<Plan> {
  const kept = obj(await kv.get(`plan:${account}`));
  if (!kept) return FREE;
  const name: PlanName = kept.name === "team" ? "team" : "free";
  const source = kept.source === "marketplace" || kept.source === "granted" ? kept.source : "none";
  const units = num(kept.units);
  const trialEnds = str(kept.trialEnds);
  return {
    name,
    source,
    ...(units === null ? {} : { units }),
    ...(trialEnds ? { trialEnds } : {}),
  };
}

export async function accountOf(kv: Kv, login: string): Promise<Account | null> {
  const id = num(await kv.get(`login:${login.toLowerCase()}`));
  if (id === null) return null;
  const kept = obj(await kv.get(`account:${id}`));
  const name = str(kept?.login);
  if (!kept || !name) return null;
  const installation = num(kept.installation);
  return {
    id,
    login: name,
    type: kept.type === "User" ? "User" : "Organization",
    ...(installation === null ? {} : { installation }),
  };
}

/** Kept from every event that names it, so the org page finds an account by its login. */
export async function keepAccount(kv: Kv, account: Account): Promise<void> {
  const kept = obj(await kv.get(`account:${account.id}`));
  const installation = account.installation ?? num(kept?.installation) ?? undefined;
  await kv.set(`account:${account.id}`, {
    ...account,
    ...(installation === undefined ? {} : { installation }),
  });
  await kv.set(`login:${account.login.toLowerCase()}`, account.id);
}

/** Marketplace's word for a plan, ours: anything not free is Team, until there are more. */
function nameOfListing(plan: Obj | null): PlanName {
  const price = num(plan?.monthly_price_in_cents) ?? 0;
  const title = (str(plan?.name) ?? "").toLowerCase();
  return price > 0 || title.includes("team") ? "team" : "free";
}

/** `marketplace_purchase`: purchased, changed, cancelled, pending changes; answers what it did. */
export async function handlePurchase(kv: Kv, payload: Obj): Promise<string> {
  const action = str(payload.action);
  const purchase = obj(payload.marketplace_purchase);
  const account = obj(purchase?.account);
  const id = num(account?.id);
  const login = str(account?.login);
  if (!purchase || id === null || !login) return "ignored";
  await keepAccount(kv, {
    id,
    login,
    type: str(account?.type) === "User" ? "User" : "Organization",
  });
  // A pending change takes effect at the end of the cycle, when `changed` comes.
  if (action === "pending_change" || action === "pending_change_cancelled")
    return `noted: ${action}`;
  const name: PlanName = action === "cancelled" ? "free" : nameOfListing(obj(purchase.plan));
  const units = num(purchase.unit_count);
  const trialEnds = purchase.on_free_trial === true ? str(purchase.free_trial_ends_on) : null;
  await kv.set(`plan:${id}`, {
    name,
    source: "marketplace",
    ...(units === null ? {} : { units }),
    ...(trialEnds ? { trialEnds } : {}),
  });
  return `plan: ${login} on ${name}`;
}
