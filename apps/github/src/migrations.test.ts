// The bridge's D1 migrations, applied in order, make the same tables as
// wake-server's SQLite statements for a new database: a release of the
// package that adds a column needs a migration here before the bridge
// deploys on it.
import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { WAKE_SQLITE_TABLES } from "@abyssinia-labs/wake-server/sqlite";

const dir = new URL("../migrations/", import.meta.url);

/** Each wake_ table's columns, and every index, as SQLite describes them. */
function shapeOf(db: Database): Record<string, string[]> {
  const shape: Record<string, string[]> = {};
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'wake_%' ORDER BY name",
    )
    .all();
  for (const { name } of tables) {
    const columns = db
      .query<{ name: string; type: string }, []>(`PRAGMA table_info(${name})`)
      .all();
    shape[name] = columns.map((one) => `${one.name} ${one.type}`).sort();
  }
  shape.indexes = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'wake_%' ORDER BY name",
    )
    .all()
    .map((one) => one.name);
  return shape;
}

test("the migrations make the tables a new database gets, devices among them", () => {
  const migrated = new Database(":memory:");
  for (const file of readdirSync(dir)
    .filter((one) => one.endsWith(".sql"))
    .sort()) {
    migrated.exec(readFileSync(new URL(file, dir), "utf8"));
  }
  const fresh = new Database(":memory:");
  for (const statement of WAKE_SQLITE_TABLES) fresh.run(statement);
  expect(shapeOf(migrated)).toEqual(shapeOf(fresh));
  expect(Object.keys(shapeOf(migrated))).toContain("wake_devices");
});
