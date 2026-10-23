// The devices that watch, on SQLite: watch codes and devices, kept as
// store.ts keeps pair codes and places. A code is spent in one conditional
// UPDATE, so two devices can't both trade the same one.
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { present } from "../rows";
import type { CodeRow, DeviceRow, WakeStore } from "../store";
import { wakeDevices, wakeWatchCodes } from "./schema";

type DeviceStore = Pick<
  WakeStore,
  | "insertWatchCode"
  | "useWatchCode"
  | "insertDevice"
  | "deviceByKeyHash"
  | "devicesOf"
  | "patchDevice"
>;

export function sqliteDeviceStore<R, S extends Record<string, unknown>>(
  db: BaseSQLiteDatabase<"async", R, S>,
): DeviceStore {
  const code = (row: typeof wakeWatchCodes.$inferSelect): CodeRow => present(row);
  const device = (row: typeof wakeDevices.$inferSelect): DeviceRow => present(row);

  return {
    async insertWatchCode(row) {
      await db.insert(wakeWatchCodes).values(row);
    },
    async useWatchCode(codeHash, now) {
      const [used] = await db
        .update(wakeWatchCodes)
        .set({ usedAt: now })
        .where(
          and(
            eq(wakeWatchCodes.codeHash, codeHash),
            isNull(wakeWatchCodes.usedAt),
            gte(wakeWatchCodes.expiresAt, now),
          ),
        )
        .returning();
      return used ? code(used) : null;
    },
    async insertDevice(row) {
      await db.insert(wakeDevices).values(row);
    },
    async deviceByKeyHash(keyHash) {
      const [row] = await db.select().from(wakeDevices).where(eq(wakeDevices.keyHash, keyHash));
      return row ? device(row) : null;
    },
    async devicesOf(agent) {
      const rows = await db
        .select()
        .from(wakeDevices)
        .where(eq(wakeDevices.agent, agent))
        .orderBy(desc(wakeDevices.madeAt))
        .limit(100);
      return rows.map(device);
    },
    async patchDevice(id, patch) {
      await db.update(wakeDevices).set(patch).where(eq(wakeDevices.id, id));
    },
  };
}
