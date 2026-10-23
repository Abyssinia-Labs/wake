// What the server half keeps, and the storage it needs to keep it: places,
// codes and summonses, and the devices that watch with their watch codes,
// behind a small interface, so Postgres through Drizzle is one
// implementation and another database can be the next. Ids from the host
// (its agents, people, tickets) are strings: `agent`, `owner`, `subject`,
// `scope`.

export type Tool = "claude" | "codex" | "cursor";
export type State = "asking" | "open" | "claimed" | "done" | "failed" | "dropped";
export type Target = { kind: string; ref: string; url: string };
/** What `started` says about a claimed summons's run. */
export type RunInfo = {
  name: string;
  tool: Tool;
  session?: string;
  machine: string;
  startedAt: number;
};

/** Wake on one machine, paired to one agent. Its key is kept as a hash. */
export type PlaceRow = {
  id: string;
  agent: string;
  owner: string;
  scope?: string;
  tool?: Tool;
  machine: string;
  platform: string;
  keyHash: string;
  pairedAt: number;
  lastSeenAt?: number;
  /** When it last won a claim, for its owner's devices (`wake:places`). */
  lastClaimAt?: number;
  forgottenAt?: number;
};

/** A pair code, or a watch code: one use, ten minutes, kept as a hash. */
export type CodeRow = {
  id: string;
  agent: string;
  agentName: string;
  owner: string;
  scope?: string;
  tool?: Tool;
  codeHash: string;
  expiresAt: number;
  usedAt?: number;
};

/** One ask of one agent about one subject (the host's ticket or page). */
export type SummonsRow = {
  id: string;
  agent: string;
  owner: string;
  askedBy: string;
  /** Who asked, as the owner's devices show an ask. */
  askerName?: string;
  scope?: string;
  subject: string;
  kind: string;
  target: Target;
  repo?: string;
  branch?: string;
  prompt: string;
  state: State;
  at: number;
  updatedAt: number;
  /** When it last became open: thirty minutes on, unclaimed, it says so. */
  openedAt?: number;
  reason?: string;
  place?: string;
  claimedAt?: number;
  finishedAt?: number;
  run?: RunInfo;
  /** True while its claimed run waits on its owner (`wake:waiting`). */
  waiting?: boolean;
};

export type SummonsPatch = Partial<Omit<SummonsRow, "id">>;

export type Platform = "ios" | "darwin" | "web";
export type AlertKind = "ask" | "waiting" | "started" | "done" | "failed";
/** Where a device takes alerts (`wake:push`): APNs from `ios` and `darwin`, Web Push from `web`. */
export type PushRegistration = {
  kinds: AlertKind[];
  apns?: { token: string; environment: "production" | "development" };
  liveActivity?: { pushToStartToken: string };
  webPush?: { endpoint: string; keys: { p256dh: string; auth: string } };
};
/** A Live Activity's own update token, for one summons (`wake:activity`). */
export type ActivityToken = { summons: string; token: string; at: number };

/** Something the owner watches the agent on. Its watch key is kept as a hash, as a place's is. */
export type DeviceRow = {
  id: string;
  agent: string;
  agentName: string;
  owner: string;
  scope?: string;
  tool?: Tool;
  name: string;
  platform: Platform;
  keyHash: string;
  madeAt: number;
  lastSeenAt?: number;
  forgottenAt?: number;
  push?: PushRegistration;
  activities?: ActivityToken[];
};

export interface WakeStore {
  insertCode(row: CodeRow): Promise<void>;
  /** Marks a live, unused code used and answers it; null for a wrong, used or expired one. */
  useCode(codeHash: string, now: number): Promise<CodeRow | null>;
  insertPlace(row: PlaceRow): Promise<void>;
  placeByKeyHash(keyHash: string): Promise<PlaceRow | null>;
  placesOf(agent: string): Promise<PlaceRow[]>;
  patchPlace(id: string, patch: Partial<Omit<PlaceRow, "id">>): Promise<void>;
  /** Forgets the agent's places and devices, and spends its pair and watch codes. */
  retireAgent(agent: string, now: number): Promise<void>;
  insertWatchCode(row: CodeRow): Promise<void>;
  /** As `useCode`, for a watch code: pair codes and watch codes never open each other's door. */
  useWatchCode(codeHash: string, now: number): Promise<CodeRow | null>;
  insertDevice(row: DeviceRow): Promise<void>;
  deviceByKeyHash(keyHash: string): Promise<DeviceRow | null>;
  /** An agent's devices, forgotten ones too, newest first; at most 100. */
  devicesOf(agent: string): Promise<DeviceRow[]>;
  patchDevice(id: string, patch: Partial<Omit<DeviceRow, "id">>): Promise<void>;
  insertSummons(row: SummonsRow): Promise<void>;
  summonsById(id: string): Promise<SummonsRow | null>;
  /** About one subject, for one agent or every one, newest change last; at most 500. */
  summonsesAbout(subject: string, agent?: string): Promise<SummonsRow[]>;
  /** An agent's summonses in one state, oldest first. */
  summonsesOf(agent: string, state: State, limit: number): Promise<SummonsRow[]>;
  /** An agent's summonses in every state, newest first: what its owner's devices list. */
  latestOf(agent: string, limit: number): Promise<SummonsRow[]>;
  /** An owner's, newest change first. */
  summonsesOwnedBy(owner: string, limit: number): Promise<SummonsRow[]>;
  /** A scope's (a tenant's), newest change first, for its audit. */
  summonsesInScope(scope: string, limit: number): Promise<SummonsRow[]>;
  /**
   * Patches it only while its state is one of `from` (and, given, its place
   * is `place`), in one statement, so two claims can't both win. Answers
   * the row after, or null when nothing matched.
   */
  moveSummons(
    id: string,
    from: readonly State[],
    patch: SummonsPatch,
    place?: string,
  ): Promise<SummonsRow | null>;
  /** Deletes up to `limit` rows the scope has, of every table; answers how many. */
  deleteScope(scope: string, limit: number): Promise<number>;
}
