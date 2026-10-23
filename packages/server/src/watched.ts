// A summons and a place as the owner's devices see them (`wake:runs`,
// `wake:places`), and a device as its owner sees it in the host: the same
// shapes the Convex component answers. Never the prompt, a path or the text
// that asked (principle 1): a device reads that in the app.
import { cleanName } from "./shape";
import type {
  AlertKind,
  DeviceRow,
  PlaceRow,
  Platform,
  PushRegistration,
  State,
  SummonsRow,
  Target,
  Tool,
} from "./store";

export type WatchedSummons = {
  id: string;
  app: string;
  kind: string;
  target: Target;
  repo?: string;
  branch?: string;
  at: number;
  state: State;
  asker?: { name: string };
  run?: { name: string; tool: Tool; session?: string; startedAt: number };
  place?: { name: string };
  waiting?: boolean;
  endedAt?: number;
  reason?: string;
};

export type WatchedPlace = {
  name: string;
  platform: string;
  pairedAt: number;
  lastClaimAt?: number;
};

/** A device in its owner's list, in the host. */
export type DeviceView = {
  id: string;
  name: string;
  platform: Platform;
  madeAt: number;
  lastSeenAt?: number;
  /** The alerts it takes (`wake:push`); none until it asks. */
  alerts: AlertKind[];
};

/** Where an alert goes: a device that wants its kind, and how to reach it. */
export type AlertTarget = Omit<PushRegistration, "kinds"> & {
  device: string;
  platform: Platform;
  /** The summons's Live Activity's own update token on this device, when it has one. */
  activityToken?: string;
};

/** Who asks, when the host didn't say: an ask can't be shown without a name. */
const SOMEONE = "Someone";
const ENDED: readonly State[] = ["done", "failed", "dropped"];

export function watchedOf(
  row: SummonsRow,
  app: string,
  places: ReadonlyMap<string, PlaceRow>,
): WatchedSummons {
  const run = row.run;
  return {
    id: row.id,
    app,
    kind: row.kind,
    target: row.target,
    ...(row.repo && row.branch ? { repo: row.repo, branch: row.branch } : {}),
    at: row.at,
    state: row.state,
    // Said only while it asks: the owner decides on a name, and needs no more.
    ...(row.state === "asking" ? { asker: { name: row.askerName ?? SOMEONE } } : {}),
    ...(run
      ? {
          run: {
            name: run.name,
            tool: run.tool,
            ...(run.session === undefined ? {} : { session: run.session }),
            startedAt: run.startedAt,
          },
        }
      : {}),
    ...(row.place ? { place: { name: cleanName(places.get(row.place)?.machine ?? "") } } : {}),
    ...(row.state === "claimed" && row.waiting ? { waiting: true } : {}),
    // Nothing changes an ended summons, so its last change is when it ended.
    ...(ENDED.includes(row.state) ? { endedAt: row.finishedAt ?? row.updatedAt } : {}),
    ...(row.reason === undefined ? {} : { reason: row.reason }),
  };
}

export function watchedPlaceOf(place: PlaceRow): WatchedPlace {
  return {
    name: cleanName(place.machine),
    platform: place.platform,
    pairedAt: place.pairedAt,
    ...(place.lastClaimAt === undefined ? {} : { lastClaimAt: place.lastClaimAt }),
  };
}

export function deviceViewOf(device: DeviceRow): DeviceView {
  return {
    id: device.id,
    name: device.name,
    platform: device.platform,
    madeAt: device.madeAt,
    ...(device.lastSeenAt === undefined ? {} : { lastSeenAt: device.lastSeenAt }),
    alerts: device.push?.kinds ?? [],
  };
}

export function alertTargetOf(device: DeviceRow, summons?: string): AlertTarget {
  const push = device.push;
  const activity = device.activities?.find((one) => one.summons === summons);
  return {
    device: device.id,
    platform: device.platform,
    ...(push?.apns ? { apns: push.apns } : {}),
    ...(push?.liveActivity ? { liveActivity: push.liveActivity } : {}),
    ...(push?.webPush ? { webPush: push.webPush } : {}),
    ...(activity ? { activityToken: activity.token } : {}),
  };
}
