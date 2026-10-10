// A summons as the host and Wake read it back: the same shapes the Convex
// component answers, so a host's code reads alike on either.
import type { PlaceRow, RunInfo, State, SummonsRow, Target } from "./store";

/** The spec's "nothing has claimed it in thirty minutes". */
export const UNCLAIMED_MS = 30 * 60_000;

export type SummonsView = {
  id: string;
  agent: string;
  owner: string;
  askedBy: string;
  scope?: string;
  subject: string;
  kind: string;
  target: Target;
  state: State;
  at: number;
  updatedAt: number;
  reason?: string;
  unclaimed: boolean;
  /** Its run once Wake said it started. `session` is the owner's to see. */
  run?: RunInfo;
};

export type PendingSummons = {
  id: string;
  app: string;
  kind: string;
  target: Target;
  repo?: string;
  branch?: string;
  at: number;
};

export type PlaceView = {
  id: string;
  machine: string;
  platform: string;
  tool?: PlaceRow["tool"];
  pairedAt: number;
  lastSeenAt?: number;
};

export function viewOf(row: SummonsRow, now: number): SummonsView {
  return {
    id: row.id,
    agent: row.agent,
    owner: row.owner,
    askedBy: row.askedBy,
    ...(row.scope === undefined ? {} : { scope: row.scope }),
    subject: row.subject,
    kind: row.kind,
    target: row.target,
    state: row.state,
    at: row.at,
    updatedAt: row.updatedAt,
    ...(row.reason === undefined ? {} : { reason: row.reason }),
    // Worked out when read, so no scheduler is needed to mark it.
    unclaimed: row.state === "open" && now - (row.openedAt ?? row.at) >= UNCLAIMED_MS,
    ...(row.run === undefined ? {} : { run: row.run }),
  };
}

export function pendingOf(row: SummonsRow, app: string): PendingSummons {
  return {
    id: row.id,
    app,
    kind: row.kind,
    target: row.target,
    ...(row.repo && row.branch ? { repo: row.repo, branch: row.branch } : {}),
    at: row.at,
  };
}

export function placeViewOf(place: PlaceRow): PlaceView {
  return {
    id: place.id,
    machine: place.machine,
    platform: place.platform,
    ...(place.tool === undefined ? {} : { tool: place.tool }),
    pairedAt: place.pairedAt,
    ...(place.lastSeenAt === undefined ? {} : { lastSeenAt: place.lastSeenAt }),
  };
}
