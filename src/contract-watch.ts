// wake/v1's watch calls (the spec's "Devices that watch"), made by a device
// with a watch key. Wake itself holds only place keys and never makes them
// (principle 5); they sit beside the place calls so `wakectl check` and a
// device written in TypeScript read an app's answers by the same rules.
import { makeFunctionReference } from "convex/server";
import {
  AGENT_TOOLS,
  type Agent,
  type AgentTool,
  asAgent,
  asSummons,
  ContractError,
  isAppName,
  isId,
  isKey,
  isLabel,
  isRecord,
  type Summons,
} from "./contract";

/** What a device is, for its owner's list: it watches and answers, and never claims. */
export const PLATFORMS = ["ios", "darwin", "web"] as const;
export type Platform = (typeof PLATFORMS)[number];
export type Device = { name: string; platform: Platform };
export type Watched = { watchKey: string; app: string; agent: Agent };

export const STATES = ["asking", "open", "claimed", "done", "failed", "dropped"] as const;
export type State = (typeof STATES)[number];
export type WatchedRun = { name: string; tool: AgentTool; session?: string; startedAt: number };
/** A summons as a device sees it: the pending fields and where it stands, still with no text. */
export type WatchedSummons = Summons & {
  state: State;
  asker?: { name: string };
  run?: WatchedRun;
  place?: { name: string };
  waiting?: boolean;
  endedAt?: number;
  reason?: string;
};
export type Place = { name: string; platform: string; pairedAt: number; lastClaimAt?: number };

/** What a watch call answers, or throws, where the agent's plan has no devices. */
export const NOT_IN_PLAN = "not-in-plan";
export const INCLUSIONS = ["included", NOT_IN_PLAN] as const;
export type Inclusion = (typeof INCLUSIONS)[number];
export type Watching = { app: string; agent: Agent; devices: Inclusion; alerts: Inclusion };

export const ALERT_KINDS = ["ask", "waiting", "started", "done", "failed"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
/** Where a device takes alerts: APNs from `ios` and `darwin`, Web Push from `web`. */
export type PushRegistration = {
  kinds: AlertKind[];
  apns?: { token: string; environment: "production" | "development" };
  liveActivity?: { pushToStartToken: string };
  webPush?: { endpoint: string; keys: { p256dh: string; auth: string } };
};

// Each takes the watch key as its argument; a place key opens none of them.
export const runsRef = makeFunctionReference<"query", { key: string }, unknown>("wake:runs");
export const answerRef = makeFunctionReference<
  "mutation",
  { key: string; id: string; yes: boolean },
  unknown
>("wake:answer");
export const placesRef = makeFunctionReference<"query", { key: string }, unknown>("wake:places");
export const watchingRef = makeFunctionReference<"query", { key: string }, unknown>(
  "wake:watching",
);
export const pushRef = makeFunctionReference<
  "mutation",
  PushRegistration & { key: string },
  unknown
>("wake:push");
export const activityRef = makeFunctionReference<
  "mutation",
  { key: string; id: string; pushToken: string },
  unknown
>("wake:activity");

/** A device's or a machine's name: shown in a list, so no control characters. */
const NAME = /^[^\p{Cc}\p{Cf}]{1,100}$/u;
/** A place's platform is whatever Wake's runtime calls it (`darwin`, `linux`). */
const PLACE_PLATFORM = /^[a-z][a-z0-9_-]{0,39}$/;
const RUN_NAME = /^[a-z]{1,16}-[a-z]{1,16}$/;
/** `wake:finish`'s bound on a reason, which a device shows as it came. */
export const MAX_REASON = 300;

function isName(v: unknown): v is string {
  return typeof v === "string" && NAME.test(v);
}

function oneOf<T extends string>(list: readonly T[], v: unknown): T | undefined {
  return list.find((one) => one === v);
}

export function asWatched(v: unknown): Watched {
  const agent = isRecord(v) ? asAgent(v.agent) : null;
  if (isRecord(v) && isKey(v.watchKey) && isAppName(v.app) && agent) {
    return { watchKey: v.watchKey, app: v.app, agent };
  }
  throw new ContractError("adding a device");
}

function asRun(v: unknown): WatchedRun | null {
  if (!isRecord(v) || typeof v.name !== "string" || !RUN_NAME.test(v.name)) return null;
  const tool = oneOf(AGENT_TOOLS, v.tool);
  if (!tool || typeof v.startedAt !== "number") return null;
  const session = isId(v.session) ? v.session : undefined;
  if (v.session !== undefined && session === undefined) return null;
  return { name: v.name, tool, ...(session ? { session } : {}), startedAt: v.startedAt };
}

// Every field past the pending ones is optional, but one that is there and
// breaks its rule skips the summons, as a broken pending field does.
function asWatchedSummons(v: unknown): WatchedSummons | null {
  const summons = asSummons(v);
  const state = isRecord(v) ? oneOf(STATES, v.state) : undefined;
  if (!summons || !isRecord(v) || !state) return null;
  const out: WatchedSummons = { ...summons, state };
  // Who asked is said only while it asks, and an ask can't be shown without it.
  if (state === "asking") {
    if (!isRecord(v.asker) || !isLabel(v.asker.name)) return null;
    out.asker = { name: v.asker.name };
  }
  if (v.run !== undefined) {
    const run = asRun(v.run);
    if (!run) return null;
    out.run = run;
  }
  if (v.place !== undefined) {
    if (!isRecord(v.place) || !isName(v.place.name)) return null;
    out.place = { name: v.place.name };
  }
  if (v.waiting === true) out.waiting = true;
  else if (v.waiting !== undefined && v.waiting !== false) return null;
  if (v.endedAt !== undefined) {
    if (typeof v.endedAt !== "number") return null;
    out.endedAt = v.endedAt;
  }
  if (v.reason !== undefined) {
    if (typeof v.reason !== "string" || v.reason.length > MAX_REASON) return null;
    out.reason = v.reason;
  }
  return out;
}

/** The valid summonses of `wake:runs`, and how many were not, as for `wake:pending`. */
export function asRuns(v: unknown): { summonses: WatchedSummons[]; rejected: number } {
  if (!Array.isArray(v)) throw new ContractError("wake:runs");
  const summonses = v.map(asWatchedSummons).filter((one) => one !== null);
  return { summonses, rejected: v.length - summonses.length };
}

function asPlace(v: unknown): Place | null {
  if (!isRecord(v) || !isName(v.name) || typeof v.pairedAt !== "number") return null;
  if (typeof v.platform !== "string" || !PLACE_PLATFORM.test(v.platform)) return null;
  const place: Place = { name: v.name, platform: v.platform, pairedAt: v.pairedAt };
  if (v.lastClaimAt !== undefined) {
    if (typeof v.lastClaimAt !== "number") return null;
    place.lastClaimAt = v.lastClaimAt;
  }
  return place;
}

export function asPlaces(v: unknown): { places: Place[]; rejected: number } {
  if (!Array.isArray(v)) throw new ContractError("wake:places");
  const places = v.map(asPlace).filter((one) => one !== null);
  return { places, rejected: v.length - places.length };
}

export function asWatching(v: unknown): Watching {
  const agent = isRecord(v) ? asAgent(v.agent) : null;
  if (isRecord(v) && isAppName(v.app) && agent) {
    const devices = oneOf(INCLUSIONS, v.devices);
    const alerts = oneOf(INCLUSIONS, v.alerts);
    if (devices && alerts) return { app: v.app, agent, devices, alerts };
  }
  throw new ContractError("wake:watching");
}
