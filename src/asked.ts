// The repositories each app has named in a summons, approved or not, kept
// so `wakectl setup` can offer those first instead of every clone on the
// machine (an "all" over forty clones approved far more than any app asks
// for, 2026-10-09). Written by the listener, only when it learns a new one.
import { readFile } from "node:fs/promises";
import { domainKey, writeJson } from "./config";
import { isRepo } from "./contract";

export type Asked = Record<string, string[]>;

export async function readAsked(path: string): Promise<Asked> {
  try {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
    const out: Asked = {};
    for (const [domain, list] of Object.entries(raw)) {
      const listed: unknown[] = Array.isArray(list) ? list : [];
      const repos = listed.filter(isRepo).map((one) => one.toLowerCase());
      if (repos.length > 0) out[domainKey(domain)] = [...new Set(repos)];
    }
    return out;
  } catch {
    return {};
  }
}

/** Adds what `domain` asked for; writes nothing when it is all known. */
export async function recordAsked(path: string, domain: string, repos: string[]): Promise<void> {
  const fresh = repos.filter(isRepo).map((one) => one.toLowerCase());
  if (fresh.length === 0) return;
  const asked = await readAsked(path);
  const key = domainKey(domain);
  const known = new Set(asked[key] ?? []);
  const before = known.size;
  for (const repo of fresh) known.add(repo);
  if (known.size === before) return;
  await writeJson(path, { ...asked, [key]: [...known].sort() });
}
