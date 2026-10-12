// The summonses read back for people, in three cuts: where one was made
// (`forSubject`), a person's runs (`forOwner`), and a tenant's audit
// (`forScope`). Apart from wake.ts so the class stays the rules.
import type { SummonsRow, WakeStore } from "./store";
import { type SummonsView, viewOf } from "./views";

/** Each agent's latest summons about `subject`. */
export async function forSubject(
  store: WakeStore,
  subject: string,
  now: number,
): Promise<SummonsView[]> {
  const latest = new Map<string, SummonsRow>();
  for (const row of await store.summonsesAbout(subject)) {
    const seen = latest.get(row.agent);
    if (!seen || row.updatedAt > seen.updatedAt) latest.set(row.agent, row);
  }
  return [...latest.values()].map((row) => viewOf(row, now));
}

/** A person's agents' summonses, newest first, without the dropped: nothing ran. */
export async function forOwner(
  store: WakeStore,
  o: { owner: string; scope?: string; limit?: number },
  now: number,
): Promise<SummonsView[]> {
  const limit = Math.max(1, Math.min(o.limit ?? 20, 50));
  return (await store.summonsesOwnedBy(o.owner, 500))
    .filter((row) => row.state !== "dropped" && (o.scope === undefined || row.scope === o.scope))
    .slice(0, limit)
    .map((row) => viewOf(row, now));
}

/** A tenant's summonses in every state, newest first, at most `limit` (50; 200 at most). */
export async function forScope(
  store: WakeStore,
  o: { scope: string; limit?: number },
  now: number,
): Promise<SummonsView[]> {
  const limit = Math.max(1, Math.min(o.limit ?? 50, 200));
  return (await store.summonsesInScope(o.scope, limit)).map((row) => viewOf(row, now));
}
