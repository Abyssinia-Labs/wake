// What the server half keeps, and the storage it needs to keep it: three
// tables (places, codes, summonses) behind a small interface, so Postgres
// through Drizzle is one implementation and another database can be the
// next. Ids from the host (its agents, people, tickets) are strings:
// `agent`, `owner`, `subject`, `scope`.

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
  forgottenAt?: number;
};

/** A pair code: one use, ten minutes, kept as a hash. */
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
};

export type SummonsPatch = Partial<Omit<SummonsRow, "id">>;

export interface WakeStore {
  insertCode(row: CodeRow): Promise<void>;
  /** Marks a live, unused code used and answers it; null for a wrong, used or expired one. */
  useCode(codeHash: string, now: number): Promise<CodeRow | null>;
  insertPlace(row: PlaceRow): Promise<void>;
  placeByKeyHash(keyHash: string): Promise<PlaceRow | null>;
  placesOf(agent: string): Promise<PlaceRow[]>;
  patchPlace(id: string, patch: Partial<Omit<PlaceRow, "id">>): Promise<void>;
  /** Forgets the agent's places and spends its codes. */
  retireAgent(agent: string, now: number): Promise<void>;
  insertSummons(row: SummonsRow): Promise<void>;
  summonsById(id: string): Promise<SummonsRow | null>;
  /** About one subject, for one agent or every one, newest change last; at most 500. */
  summonsesAbout(subject: string, agent?: string): Promise<SummonsRow[]>;
  /** An agent's summonses in one state, oldest first. */
  summonsesOf(agent: string, state: State, limit: number): Promise<SummonsRow[]>;
  /** An owner's, newest change first. */
  summonsesOwnedBy(owner: string, limit: number): Promise<SummonsRow[]>;
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
  /** Deletes up to `limit` rows the scope has, places, codes and summonses; answers how many. */
  deleteScope(scope: string, limit: number): Promise<number>;
}
