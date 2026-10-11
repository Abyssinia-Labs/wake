-- wake-server's tables (WAKE_SQLITE_TABLES) and the bridge's own, for D1.
CREATE TABLE IF NOT EXISTS wake_places (id text PRIMARY KEY, agent text NOT NULL, owner text NOT NULL, scope text, tool text, machine text NOT NULL, platform text NOT NULL, key_hash text NOT NULL UNIQUE, paired_at integer NOT NULL, last_seen_at integer, forgotten_at integer);
CREATE INDEX IF NOT EXISTS wake_places_agent_idx ON wake_places (agent);
CREATE INDEX IF NOT EXISTS wake_places_scope_idx ON wake_places (scope);
CREATE TABLE IF NOT EXISTS wake_codes (id text PRIMARY KEY, agent text NOT NULL, agent_name text NOT NULL, owner text NOT NULL, scope text, tool text, code_hash text NOT NULL UNIQUE, expires_at integer NOT NULL, used_at integer);
CREATE INDEX IF NOT EXISTS wake_codes_agent_idx ON wake_codes (agent);
CREATE INDEX IF NOT EXISTS wake_codes_scope_idx ON wake_codes (scope);
CREATE TABLE IF NOT EXISTS wake_summonses (id text PRIMARY KEY, agent text NOT NULL, owner text NOT NULL, asked_by text NOT NULL, scope text, subject text NOT NULL, kind text NOT NULL, target text NOT NULL, repo text, branch text, prompt text NOT NULL, state text NOT NULL, at integer NOT NULL, updated_at integer NOT NULL, opened_at integer, reason text, place text, claimed_at integer, finished_at integer, run text);
CREATE INDEX IF NOT EXISTS wake_summonses_subject_idx ON wake_summonses (subject, agent);
CREATE INDEX IF NOT EXISTS wake_summonses_agent_state_idx ON wake_summonses (agent, state, at);
CREATE INDEX IF NOT EXISTS wake_summonses_owner_idx ON wake_summonses (owner, updated_at);
CREATE INDEX IF NOT EXISTS wake_summonses_scope_idx ON wake_summonses (scope);
CREATE TABLE IF NOT EXISTS github_asks (summons text PRIMARY KEY, installation integer NOT NULL, repo text NOT NULL, number integer NOT NULL, asker text NOT NULL, status_comment integer);
