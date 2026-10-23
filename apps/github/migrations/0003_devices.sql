-- wake-server's tables for devices that watch (WAKE_SQLITE_DEVICES_UPGRADE):
-- the columns its store now reads and writes, and the watch codes and
-- devices. Apply before deploying a bridge built on it.
ALTER TABLE wake_places ADD COLUMN last_claim_at integer;
ALTER TABLE wake_summonses ADD COLUMN asker_name text;
ALTER TABLE wake_summonses ADD COLUMN waiting integer;
CREATE TABLE IF NOT EXISTS wake_watch_codes (id text PRIMARY KEY, agent text NOT NULL, agent_name text NOT NULL, owner text NOT NULL, scope text, tool text, code_hash text NOT NULL UNIQUE, expires_at integer NOT NULL, used_at integer);
CREATE INDEX IF NOT EXISTS wake_watch_codes_agent_idx ON wake_watch_codes (agent);
CREATE INDEX IF NOT EXISTS wake_watch_codes_scope_idx ON wake_watch_codes (scope);
CREATE TABLE IF NOT EXISTS wake_devices (id text PRIMARY KEY, agent text NOT NULL, agent_name text NOT NULL, owner text NOT NULL, scope text, tool text, name text NOT NULL, platform text NOT NULL, key_hash text NOT NULL UNIQUE, made_at integer NOT NULL, last_seen_at integer, forgotten_at integer, push text, activities text);
CREATE INDEX IF NOT EXISTS wake_devices_agent_idx ON wake_devices (agent, made_at);
CREATE INDEX IF NOT EXISTS wake_devices_scope_idx ON wake_devices (scope);
CREATE INDEX IF NOT EXISTS wake_summonses_agent_at_idx ON wake_summonses (agent, at);
