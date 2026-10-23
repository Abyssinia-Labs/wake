// The calls Wake makes (the spec's "The functions" and "The HTTP
// transport"), each with the place key: wake:pending, claim, started,
// finish and waiting. Each finds the place by its key's hash and answers
// for that place's agent only; a key that opens nothing is UNPAIRED.
import type { Changes } from "./changes";
import { WakeError } from "./errors";
import { hashSecret, KEY_SHAPE } from "./keys";
import { type Inclusion, isRunReport } from "./shape";
import type { PlaceRow, SummonsRow, Tool, WakeStore } from "./store";
import { type PendingSummons, pendingOf } from "./views";

/**
 * What the host hears as a run goes, to show it where it was asked (a
 * comment on a GitHub issue, say). Called after the change is kept, and
 * awaited; a hook that throws is ignored, so Wake's call still succeeds.
 */
export type WakeHooks = {
  started?: (summons: SummonsRow) => void | Promise<void>;
  finished?: (summons: SummonsRow) => void | Promise<void>;
};

/** What an agent's plan includes: devices that watch, and alerts sent to them. */
export type Plan = { devices: Inclusion; alerts: Inclusion };
/** Whose plan: the agent a device watches, its owner, and its scope when it has one. */
export type WatchedAgent = { agent: string; owner: string; scope?: string };
/** The host's say on an agent's plan, asked at each watch call; without it, everything is included. */
export type PlanHook = (watched: WatchedAgent) => Plan | Promise<Plan>;

export type WakeContext = {
  app: string;
  store: WakeStore;
  changes: Changes;
  now: () => number;
  hooks?: WakeHooks;
  plan?: PlanHook;
};

async function tell(
  hook: ((row: SummonsRow) => void | Promise<void>) | undefined,
  row: SummonsRow | null,
): Promise<void> {
  if (!hook || !row) return;
  try {
    await hook(row);
  } catch {
    // The host's own trouble; the run's record is already kept.
  }
}
export type ClaimResult = { claimed: true; run: { prompt: string } } | { claimed: false };
export type RunReport = { name: string; tool: Tool; session?: string };

/** Oldest first, at most this many: Wake runs two at a time. */
const PENDING_LIMIT = 50;

export async function placeOf(c: WakeContext, key: string): Promise<PlaceRow> {
  if (!KEY_SHAPE.test(key)) throw new WakeError("UNPAIRED");
  const place = await c.store.placeByKeyHash(await hashSecret(key));
  if (!place || place.forgottenAt !== undefined) throw new WakeError("UNPAIRED");
  return place;
}

/** The place's agent's open summonses, oldest first. No text. */
export async function pending(c: WakeContext, key: string): Promise<PendingSummons[]> {
  const place = await placeOf(c, key);
  const rows = await c.store.summonsesOf(place.agent, "open", PENDING_LIMIT);
  return rows.map((row) => pendingOf(row, c.app));
}

/** The first place to ask wins; every other is told it lost. */
export async function claim(c: WakeContext, key: string, id: string): Promise<ClaimResult> {
  const place = await placeOf(c, key);
  const row = await c.store.summonsById(id);
  if (!row || row.agent !== place.agent) return { claimed: false };
  const now = c.now();
  const won = await c.store.moveSummons(id, ["open"], {
    state: "claimed",
    place: place.id,
    claimedAt: now,
    updatedAt: now,
  });
  if (!won) return { claimed: false };
  await c.store.patchPlace(place.id, { lastSeenAt: now, lastClaimAt: now });
  c.changes.publish(place.agent);
  return { claimed: true, run: { prompt: won.prompt } };
}

/** The agent is running, under a name; a later call fills in the session. */
export async function started(
  c: WakeContext,
  key: string,
  id: string,
  run: RunReport,
): Promise<void> {
  const place = await placeOf(c, key);
  if (!isRunReport(run)) return;
  const row = await c.store.summonsById(id);
  if (!row || row.place !== place.id || row.state !== "claimed") return;
  const now = c.now();
  const moved = await c.store.moveSummons(
    id,
    ["claimed"],
    {
      run: {
        name: run.name,
        tool: run.tool,
        ...(run.session === undefined ? {} : { session: run.session }),
        machine: place.machine,
        startedAt: row.run?.startedAt ?? now,
      },
      updatedAt: now,
    },
    place.id,
  );
  await c.store.patchPlace(place.id, { lastSeenAt: now });
  if (moved) c.changes.publish(place.agent);
  await tell(c.hooks?.started, moved);
}

/** What became of a run this place claimed; another place's, or a finished one, is left. */
export async function finish(
  c: WakeContext,
  key: string,
  id: string,
  outcome: "done" | "failed",
  reason?: string,
): Promise<void> {
  const place = await placeOf(c, key);
  const now = c.now();
  const ended = await c.store.moveSummons(
    id,
    ["claimed"],
    {
      state: outcome,
      finishedAt: now,
      updatedAt: now,
      ...(reason ? { reason: reason.slice(0, 300) } : {}),
    },
    place.id,
  );
  await c.store.patchPlace(place.id, { lastSeenAt: now });
  if (ended) c.changes.publish(place.agent);
  await tell(c.hooks?.finished, ended);
}

/**
 * The run this place claimed stops on a question for its owner, or goes on.
 * Not a word of the question: it stays on the machine, and the owner's
 * devices see only that it waits (`wake:runs`).
 */
export async function waiting(
  c: WakeContext,
  key: string,
  id: string,
  waits: boolean,
): Promise<void> {
  const place = await placeOf(c, key);
  const now = c.now();
  const moved = await c.store.moveSummons(
    id,
    ["claimed"],
    { waiting: waits, updatedAt: now },
    place.id,
  );
  await c.store.patchPlace(place.id, { lastSeenAt: now });
  if (moved) c.changes.publish(place.agent);
}
