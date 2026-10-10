// The server half's three tables for Postgres, as Drizzle tables: add them
// to your schema (`export * from "@abyssinia-labs/wake-server/drizzle"`'s
// tables) and let drizzle-kit migrate them, or run `WAKE_TABLES_SQL` once.
// Times are milliseconds, as in the spec.
import { bigint, index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import type { RunInfo, State, Target, Tool } from "../store";

const ms = (name: string) => bigint(name, { mode: "number" });

export const wakePlaces = pgTable(
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
    pairedAt: ms("paired_at").notNull(),
    lastSeenAt: ms("last_seen_at"),
    forgottenAt: ms("forgotten_at"),
  },
  (t) => [index("wake_places_agent_idx").on(t.agent), index("wake_places_scope_idx").on(t.scope)],
);

export const wakeCodes = pgTable(
  "wake_codes",
  {
    id: text("id").primaryKey(),
    agent: text("agent").notNull(),
    agentName: text("agent_name").notNull(),
    owner: text("owner").notNull(),
    scope: text("scope"),
    tool: text("tool").$type<Tool>(),
    codeHash: text("code_hash").notNull().unique(),
    expiresAt: ms("expires_at").notNull(),
    usedAt: ms("used_at"),
  },
  (t) => [index("wake_codes_agent_idx").on(t.agent), index("wake_codes_scope_idx").on(t.scope)],
);

export const wakeSummonses = pgTable(
  "wake_summonses",
  {
    id: text("id").primaryKey(),
    agent: text("agent").notNull(),
    owner: text("owner").notNull(),
    askedBy: text("asked_by").notNull(),
    scope: text("scope"),
    subject: text("subject").notNull(),
    kind: text("kind").notNull(),
    target: jsonb("target").$type<Target>().notNull(),
    repo: text("repo"),
    branch: text("branch"),
    prompt: text("prompt").notNull(),
    state: text("state").$type<State>().notNull(),
    at: ms("at").notNull(),
    updatedAt: ms("updated_at").notNull(),
    openedAt: ms("opened_at"),
    reason: text("reason"),
    place: text("place"),
    claimedAt: ms("claimed_at"),
    finishedAt: ms("finished_at"),
    run: jsonb("run").$type<RunInfo>(),
  },
  (t) => [
    index("wake_summonses_subject_idx").on(t.subject, t.agent),
    index("wake_summonses_agent_state_idx").on(t.agent, t.state, t.at),
    index("wake_summonses_owner_idx").on(t.owner, t.updatedAt),
    index("wake_summonses_scope_idx").on(t.scope),
  ],
);

/** The same tables as SQL, for an app that doesn't migrate with drizzle-kit. Safe to run twice. */
export const WAKE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS wake_places (
  id text PRIMARY KEY, agent text NOT NULL, owner text NOT NULL, scope text, tool text,
  machine text NOT NULL, platform text NOT NULL, key_hash text NOT NULL UNIQUE,
  paired_at bigint NOT NULL, last_seen_at bigint, forgotten_at bigint
);
CREATE INDEX IF NOT EXISTS wake_places_agent_idx ON wake_places (agent);
CREATE INDEX IF NOT EXISTS wake_places_scope_idx ON wake_places (scope);
CREATE TABLE IF NOT EXISTS wake_codes (
  id text PRIMARY KEY, agent text NOT NULL, agent_name text NOT NULL, owner text NOT NULL,
  scope text, tool text, code_hash text NOT NULL UNIQUE, expires_at bigint NOT NULL, used_at bigint
);
CREATE INDEX IF NOT EXISTS wake_codes_agent_idx ON wake_codes (agent);
CREATE INDEX IF NOT EXISTS wake_codes_scope_idx ON wake_codes (scope);
CREATE TABLE IF NOT EXISTS wake_summonses (
  id text PRIMARY KEY, agent text NOT NULL, owner text NOT NULL, asked_by text NOT NULL,
  scope text, subject text NOT NULL, kind text NOT NULL, target jsonb NOT NULL, repo text,
  branch text, prompt text NOT NULL, state text NOT NULL, at bigint NOT NULL,
  updated_at bigint NOT NULL, opened_at bigint, reason text, place text, claimed_at bigint,
  finished_at bigint, run jsonb
);
CREATE INDEX IF NOT EXISTS wake_summonses_subject_idx ON wake_summonses (subject, agent);
CREATE INDEX IF NOT EXISTS wake_summonses_agent_state_idx ON wake_summonses (agent, state, at);
CREATE INDEX IF NOT EXISTS wake_summonses_owner_idx ON wake_summonses (owner, updated_at);
CREATE INDEX IF NOT EXISTS wake_summonses_scope_idx ON wake_summonses (scope);
`;
