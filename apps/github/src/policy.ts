// An organisation's Wake policy, on the Team plan (WAK-23): which of its
// repositories may summon, and who. Free has no policy: anyone who can push
// wakes their own agent, as before.
import type { Kv } from "./kv";
import { obj, str } from "./payload";

export type Who = "push" | "admins";
export type Policy = { repos: string[] | null; who: Who; updatedBy?: string };

export const OPEN: Policy = { repos: null, who: "push" };

export async function policyOf(kv: Kv, account: number): Promise<Policy> {
  const kept = obj(await kv.get(`policy:${account}`));
  if (!kept) return OPEN;
  const repos = Array.isArray(kept.repos)
    ? kept.repos.filter((one): one is string => typeof one === "string")
    : null;
  const updatedBy = str(kept.updatedBy);
  return {
    repos,
    who: kept.who === "admins" ? "admins" : "push",
    ...(updatedBy ? { updatedBy } : {}),
  };
}

export async function setPolicy(kv: Kv, account: number, policy: Policy): Promise<void> {
  await kv.set(`policy:${account}`, policy);
}

/** Why the policy refuses this summons, in words for the person, or null when it allows it. */
export function refusal(policy: Policy, repo: string, permission: string): string | null {
  const name = repo.toLowerCase();
  if (policy.repos && !policy.repos.some((one) => one.toLowerCase() === name)) {
    return `this organisation's Wake policy doesn't include ${repo}`;
  }
  if (policy.who === "admins" && permission !== "admin" && permission !== "maintain") {
    return "this organisation's Wake policy lets only admins and maintainers summon";
  }
  return null;
}

/** The form's repositories: one per line, `owner/name`, blank for all. */
export function reposFrom(text: string): string[] | null {
  const repos = text
    .split(/[\s,]+/)
    .map((one) => one.trim())
    .filter((one) => /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/.test(one));
  return repos.length > 0 ? [...new Set(repos)] : null;
}
