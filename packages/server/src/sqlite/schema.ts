// The server half's three tables for SQLite, as Drizzle tables: Cloudflare
// D1, bun:sqlite, better-sqlite3, libSQL / Turso. The same columns as the
// Postgres ones; times are integer milliseconds, `target` and `run` JSON.
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { RunInfo, State, Target, Tool } from "../store";

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
    forgottenAt: integer("forgotten_at"),
  },
  (t) => [index("wake_places_agent_idx").on(t.agent), index("wake_places_scope_idx").on(t.scope)],
);

export const wakeCodes = sqliteTable(
  "wake_codes",
  {
    id: text("id").primaryKey(),
    agent: text("agent").notNull(),
    agentName: text("agent_name").notNull(),
    owner: text("owner").notNull(),
    scope: text("scope"),
    tool: text("tool").$type<Tool>(),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
  },
  (t) => [index("wake_codes_agent_idx").on(t.agent), index("wake_codes_scope_idx").on(t.scope)],
);

export const wakeSummonses = sqliteTable(
  "wake_summonses",
  {
    id: text("id").primaryKey(),
    agent: text("agent").notNull(),
    owner: text("owner").notNull(),
    askedBy: text("asked_by").notNull(),
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
  },
  (t) => [
    index("wake_summonses_subject_idx").on(t.subject, t.agent),
    index("wake_summonses_agent_state_idx").on(t.agent, t.state, t.at),
    index("wake_summonses_owner_idx").on(t.owner, t.updatedAt),
    index("wake_summonses_scope_idx").on(t.scope),
  ],
);

/** The same tables as SQL, one statement per entry (D1's `batch` and `exec` take them so). */
export const WAKE_SQLITE_TABLES: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS wake_places (id text PRIMARY KEY, agent text NOT NULL, owner text NOT NULL, scope text, tool text, machine text NOT NULL, platform text NOT NULL, key_hash text NOT NULL UNIQUE, paired_at integer NOT NULL, last_seen_at integer, forgotten_at integer)`,
  "CREATE INDEX IF NOT EXISTS wake_places_agent_idx ON wake_places (agent)",
  "CREATE INDEX IF NOT EXISTS wake_places_scope_idx ON wake_places (scope)",
  `CREATE TABLE IF NOT EXISTS wake_codes (id text PRIMARY KEY, agent text NOT NULL, agent_name text NOT NULL, owner text NOT NULL, scope text, tool text, code_hash text NOT NULL UNIQUE, expires_at integer NOT NULL, used_at integer)`,
  "CREATE INDEX IF NOT EXISTS wake_codes_agent_idx ON wake_codes (agent)",
  "CREATE INDEX IF NOT EXISTS wake_codes_scope_idx ON wake_codes (scope)",
  `CREATE TABLE IF NOT EXISTS wake_summonses (id text PRIMARY KEY, agent text NOT NULL, owner text NOT NULL, asked_by text NOT NULL, scope text, subject text NOT NULL, kind text NOT NULL, target text NOT NULL, repo text, branch text, prompt text NOT NULL, state text NOT NULL, at integer NOT NULL, updated_at integer NOT NULL, opened_at integer, reason text, place text, claimed_at integer, finished_at integer, run text)`,
  "CREATE INDEX IF NOT EXISTS wake_summonses_subject_idx ON wake_summonses (subject, agent)",
  "CREATE INDEX IF NOT EXISTS wake_summonses_agent_state_idx ON wake_summonses (agent, state, at)",
  "CREATE INDEX IF NOT EXISTS wake_summonses_owner_idx ON wake_summonses (owner, updated_at)",
  "CREATE INDEX IF NOT EXISTS wake_summonses_scope_idx ON wake_summonses (scope)",
];
