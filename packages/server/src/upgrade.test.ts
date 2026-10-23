// Tables made before devices that watch, with rows in them, brought up to
// these: `WAKE_TABLES_SQL` run again on Postgres, `WAKE_SQLITE_DEVICES_UPGRADE`
// once on SQLite. The store writes every column, so it fails until then.
// (SQLite reads a missing column as its own name, a string: worse than
// failing, and why the upgrade comes before the new release.)
import { describe, expect, test } from "bun:test";
import { WAKE_TABLES_SQL } from "./drizzle";
import { WAKE_SQLITE_DEVICES_UPGRADE } from "./sqlite";
import { ask, databaseOf, pairedKey, STORES, type StoreKind, testWake, watchKey } from "./test-db";

/** What takes these tables back to wake-server 0.4's. */
const BACK = [
  "ALTER TABLE wake_places DROP COLUMN last_claim_at",
  "ALTER TABLE wake_summonses DROP COLUMN asker_name",
  "ALTER TABLE wake_summonses DROP COLUMN waiting",
  "DROP INDEX wake_summonses_agent_at_idx",
  "DROP TABLE wake_watch_codes",
  "DROP TABLE wake_devices",
];
const UPGRADE: Record<StoreKind, readonly string[]> = {
  postgres: [WAKE_TABLES_SQL],
  sqlite: WAKE_SQLITE_DEVICES_UPGRADE,
};

for (const kind of STORES) {
  describe(kind, () => {
    test("tables of an earlier release, rows and all, take devices after the upgrade", async () => {
      const db = await databaseOf(kind);
      const { wake } = await testWake(kind, {}, db.store);
      const place = await pairedKey(wake);
      const id = await wake.summon(ask());
      for (const sql of BACK) await db.run(sql);
      await expect(wake.summon(ask({ subject: "ticket-2" }))).rejects.toThrow();
      for (const sql of UPGRADE[kind]) await db.run(sql);
      expect(await wake.pending(place)).toHaveLength(1);
      const device = await watchKey(wake);
      await wake.claim(place, id);
      expect((await wake.watchCalls.runs(device))[0]).toMatchObject({
        id,
        state: "claimed",
        place: { name: "Ada's Mac" },
      });
      expect((await wake.watchCalls.places(device))[0]?.lastClaimAt).toEqual(expect.any(Number));
      // Postgres's is safe to run again; SQLite's is run once.
      if (kind === "postgres") await db.run(WAKE_TABLES_SQL);
    });
  });
}
