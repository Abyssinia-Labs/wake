// The server half's tables for SQLite, as Drizzle tables: Cloudflare D1,
// bun:sqlite, better-sqlite3, libSQL / Turso. The same columns as the
// Postgres ones; times are integer milliseconds, `target`, `run`, `push`
// and `activities` JSON, `waiting` 0 or 1.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type {
  ActivityToken,
  Platform,
  PushRegistration,
  RunInfo,
  State,
  Target,
  Tool,
} from "../store";

export const wakePlaces = sqliteTable(
  "wake_places",
  {
    id: text("id").primaryKey(),
    agent: text("agent").notNull(),
    owner: text("owner").notNull(),
    scope: text("scope"),
    tool: text("tool").$type<Tool>(),
    machine: text("machine").notNull(),
    platform: text("platform").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    pairedAt: integer("paired_at").notNull(),
    lastSeenAt: integer("last_seen_at"),
    lastClaimAt: integer("last_claim_at"),
    forgottenAt: integer("forgotten_at"),
  },
  (t) => [index("wake_places_agent_idx").on(t.agent), index("wake_places_scope_idx").on(t.scope)],
);

const code = {
  id: text("id").primaryKey(),
  agent: text("agent").notNull(),
  agentName: text("agent_name").notNull(),
  owner: text("owner").notNull(),
  scope: text("scope"),
  tool: text("tool").$type<Tool>(),
  codeHash: text("code_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  usedAt: integer("used_at"),
};

export const wakeCodes = sqliteTable("wake_codes", code, (t) => [
  index("wake_codes_agent_idx").on(t.agent),
  index("wake_codes_scope_idx").on(t.scope),
]);

/** Watch codes, apart from pair codes so neither opens the other's door. */
export const wakeWatchCodes = sqliteTable("wake_watch_codes", code, (t) => [
  index("wake_watch_codes_agent_idx").on(t.agent),
  index("wake_watch_codes_scope_idx").on(t.scope),
]);

export const wakeDevices = sqliteTable(
  "wake_devices",
  {
    id: text("id").primaryKey(),
    agent: text("agent").notNull(),
    agentName: text("agent_name").notNull(),
    owner: text("owner").notNull(),
    scope: text("scope"),
    tool: text("tool").$type<Tool>(),
    name: text("name").notNull(),
    platform: text("platform").$type<Platform>().notNull(),
    keyHash: text("key_hash").notNull().unique(),
    madeAt: integer("made_at").notNull(),
    lastSeenAt: integer("last_seen_at"),
    forgottenAt: integer("forgotten_at"),
    push: text("push", { mode: "json" }).$type<PushRegistration>(),
    activities: text("activities", { mode: "json" }).$type<ActivityToken[]>(),
  },
  (t) => [
    index("wake_devices_agent_idx").on(t.agent, t.madeAt),
    index("wake_devices_scope_idx").on(t.scope),
  ],
);

export const wakeSummonses = sqliteTable(
  "wake_summonses",
  {
    id: text("id").primaryKey(),
    agent: text("agent").notNull(),
    owner: text("owner").notNull(),
    askedBy: text("asked_by").notNull(),
    askerName: text("asker_name"),
    scope: text("scope"),
    subject: text("subject").notNull(),
    kind: text("kind").notNull(),
    target: text("target", { mode: "json" }).$type<Target>().notNull(),
    repo: text("repo"),
    branch: text("branch"),
    prompt: text("prompt").notNull(),
    state: text("state").$type<State>().notNull(),
    at: integer("at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    openedAt: integer("opened_at"),
    reason: text("reason"),
    place: text("place"),
    claimedAt: integer("claimed_at"),
    finishedAt: integer("finished_at"),
    run: text("run", { mode: "json" }).$type<RunInfo>(),
    waiting: integer("waiting", { mode: "boolean" }),
  },
  (t) => [
    index("wake_summonses_subject_idx").on(t.subject, t.agent),
    index("wake_summonses_agent_state_idx").on(t.agent, t.state, t.at),
    index("wake_summonses_agent_at_idx").on(t.agent, t.at),
    index("wake_summonses_owner_idx").on(t.owner, t.updatedAt),
    index("wake_summonses_scope_idx").on(t.scope),
  ],
);

/** Tables new with devices that watch: made the same way whether the rest is new or not. */
const DEVICE_TABLES = [
  `CREATE TABLE IF NOT EXISTS wake_watch_codes (id text PRIMARY KEY, agent text NOT NULL, agent_name text NOT NULL, owner text NOT NULL, scope text, tool text, code_hash text NOT NULL UNIQUE, expires_at integer NOT NULL, used_at integer)`,
  "CREATE INDEX IF NOT EXISTS wake_watch_codes_agent_idx ON wake_watch_codes (agent)",
  "CREATE INDEX IF NOT EXISTS wake_watch_codes_scope_idx ON wake_watch_codes (scope)",
  `CREATE TABLE IF NOT EXISTS wake_devices (id text PRIMARY KEY, agent text NOT NULL, agent_name text NOT NULL, owner text NOT NULL, scope text, tool text, name text NOT NULL, platform text NOT NULL, key_hash text NOT NULL UNIQUE, made_at integer NOT NULL, last_seen_at integer, forgotten_at integer, push text, activities text)`,
  "CREATE INDEX IF NOT EXISTS wake_devices_agent_idx ON wake_devices (agent, made_at)",
  "CREATE INDEX IF NOT EXISTS wake_devices_scope_idx ON wake_devices (scope)",
  "CREATE INDEX IF NOT EXISTS wake_summonses_agent_at_idx ON wake_summonses (agent, at)",
];

/** The same tables as SQL, one statement per entry (D1's `batch` and `exec` take them so). */
export const WAKE_SQLITE_TABLES: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS wake_places (id text PRIMARY KEY, agent text NOT NULL, owner text NOT NULL, scope text, tool text, machine text NOT NULL, platform text NOT NULL, key_hash text NOT NULL UNIQUE, paired_at integer NOT NULL, last_seen_at integer, last_claim_at integer, forgotten_at integer)`,
  "CREATE INDEX IF NOT EXISTS wake_places_agent_idx ON wake_places (agent)",
  "CREATE INDEX IF NOT EXISTS wake_places_scope_idx ON wake_places (scope)",
  `CREATE TABLE IF NOT EXISTS wake_codes (id text PRIMARY KEY, agent text NOT NULL, agent_name text NOT NULL, owner text NOT NULL, scope text, tool text, code_hash text NOT NULL UNIQUE, expires_at integer NOT NULL, used_at integer)`,
  "CREATE INDEX IF NOT EXISTS wake_codes_agent_idx ON wake_codes (agent)",
  "CREATE INDEX IF NOT EXISTS wake_codes_scope_idx ON wake_codes (scope)",
  `CREATE TABLE IF NOT EXISTS wake_summonses (id text PRIMARY KEY, agent text NOT NULL, owner text NOT NULL, asked_by text NOT NULL, asker_name text, scope text, subject text NOT NULL, kind text NOT NULL, target text NOT NULL, repo text, branch text, prompt text NOT NULL, state text NOT NULL, at integer NOT NULL, updated_at integer NOT NULL, opened_at integer, reason text, place text, claimed_at integer, finished_at integer, run text, waiting integer)`,
  "CREATE INDEX IF NOT EXISTS wake_summonses_subject_idx ON wake_summonses (subject, agent)",
  "CREATE INDEX IF NOT EXISTS wake_summonses_agent_state_idx ON wake_summonses (agent, state, at)",
  "CREATE INDEX IF NOT EXISTS wake_summonses_owner_idx ON wake_summonses (owner, updated_at)",
  "CREATE INDEX IF NOT EXISTS wake_summonses_scope_idx ON wake_summonses (scope)",
  ...DEVICE_TABLES,
];

/**
 * What brings tables made before devices that watch (wake-server 0.4 and
 * earlier) up to these, one statement per entry. Run them once: SQLite
 * can't add a column only if it is missing, so a second run fails on the
 * first column.
 */
export const WAKE_SQLITE_DEVICES_UPGRADE: readonly string[] = [
  "ALTER TABLE wake_places ADD COLUMN last_claim_at integer",
  "ALTER TABLE wake_summonses ADD COLUMN asker_name text",
  "ALTER TABLE wake_summonses ADD COLUMN waiting integer",
  ...DEVICE_TABLES,
];
