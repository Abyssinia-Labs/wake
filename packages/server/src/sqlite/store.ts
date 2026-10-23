// The server half's storage on SQLite through Drizzle: Cloudflare D1,
// bun:sqlite, better-sqlite3, libSQL. Each change of state is one
// conditional UPDATE with RETURNING, so two places claiming at once can't
// both win, as on Postgres (WAK-9); SQLite runs one writer at a time, and
// the WHERE settles which.
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { present } from "../rows";
import type { CodeRow, PlaceRow, State, SummonsPatch, SummonsRow, WakeStore } from "../store";
import { sqliteDeviceStore } from "./device-store";
import { wakeCodes, wakeDevices, wakePlaces, wakeSummonses, wakeWatchCodes } from "./schema";

/** D1, libSQL and other async drivers; a sync one (bun:sqlite) goes through `drizzle-orm/sqlite-proxy`. */
export function sqliteStore<R, S extends Record<string, unknown>>(
  db: BaseSQLiteDatabase<"async", R, S>,
): WakeStore {
  const place = (row: typeof wakePlaces.$inferSelect): PlaceRow => present(row);
  const code = (row: typeof wakeCodes.$inferSelect): CodeRow => present(row);
  const summons = (row: typeof wakeSummonses.$inferSelect): SummonsRow => present(row);

  return {
    ...sqliteDeviceStore(db),
    async insertCode(row) {
      await db.insert(wakeCodes).values(row);
    },
    async useCode(codeHash, now) {
      const [used] = await db
        .update(wakeCodes)
        .set({ usedAt: now })
        .where(
          and(
            eq(wakeCodes.codeHash, codeHash),
            isNull(wakeCodes.usedAt),
            gte(wakeCodes.expiresAt, now),
          ),
        )
        .returning();
      return used ? code(used) : null;
    },
    async insertPlace(row) {
      await db.insert(wakePlaces).values(row);
    },
    async placeByKeyHash(keyHash) {
      const [row] = await db.select().from(wakePlaces).where(eq(wakePlaces.keyHash, keyHash));
      return row ? place(row) : null;
    },
    async placesOf(agent) {
      const rows = await db.select().from(wakePlaces).where(eq(wakePlaces.agent, agent)).limit(100);
      return rows.map(place);
    },
    async patchPlace(id, patch) {
      await db.update(wakePlaces).set(patch).where(eq(wakePlaces.id, id));
    },
    async retireAgent(agent, now) {
      for (const table of [wakePlaces, wakeDevices] as const) {
        await db
          .update(table)
          .set({ forgottenAt: now })
          .where(and(eq(table.agent, agent), isNull(table.forgottenAt)));
      }
      for (const table of [wakeCodes, wakeWatchCodes] as const) {
        await db
          .update(table)
          .set({ usedAt: now })
          .where(and(eq(table.agent, agent), isNull(table.usedAt)));
      }
    },
    async insertSummons(row) {
      await db.insert(wakeSummonses).values(row);
    },
    async summonsById(id) {
      const [row] = await db.select().from(wakeSummonses).where(eq(wakeSummonses.id, id));
      return row ? summons(row) : null;
    },
    async summonsesAbout(subject, agent) {
      const rows = await db
        .select()
        .from(wakeSummonses)
        .where(
          agent === undefined
            ? eq(wakeSummonses.subject, subject)
            : and(eq(wakeSummonses.subject, subject), eq(wakeSummonses.agent, agent)),
        )
        .orderBy(asc(wakeSummonses.updatedAt))
        .limit(500);
      return rows.map(summons);
    },
    async summonsesOf(agent, state, limit) {
      const rows = await db
        .select()
        .from(wakeSummonses)
        .where(and(eq(wakeSummonses.agent, agent), eq(wakeSummonses.state, state)))
        .orderBy(asc(wakeSummonses.at))
        .limit(limit);
      return rows.map(summons);
    },
    async latestOf(agent, limit) {
      const rows = await db
        .select()
        .from(wakeSummonses)
        .where(eq(wakeSummonses.agent, agent))
        .orderBy(desc(wakeSummonses.at))
        .limit(limit);
      return rows.map(summons);
    },
    async summonsesOwnedBy(owner, limit) {
      const rows = await db
        .select()
        .from(wakeSummonses)
        .where(eq(wakeSummonses.owner, owner))
        .orderBy(desc(wakeSummonses.updatedAt))
        .limit(limit);
      return rows.map(summons);
    },
    async summonsesInScope(scope, limit) {
      const rows = await db
        .select()
        .from(wakeSummonses)
        .where(eq(wakeSummonses.scope, scope))
        .orderBy(desc(wakeSummonses.updatedAt))
        .limit(limit);
      return rows.map(summons);
    },
    async moveSummons(id, from: readonly State[], patch: SummonsPatch, placeId?: string) {
      const [row] = await db
        .update(wakeSummonses)
        .set(patch)
        .where(
          and(
            eq(wakeSummonses.id, id),
            inArray(wakeSummonses.state, [...from]),
            placeId === undefined ? undefined : eq(wakeSummonses.place, placeId),
          ),
        )
        .returning();
      return row ? summons(row) : null;
    },
    async deleteScope(scope, limit) {
      let deleted = 0;
      const tables = [wakeSummonses, wakeCodes, wakePlaces, wakeWatchCodes, wakeDevices] as const;
      for (const table of tables) {
        if (deleted >= limit) break;
        const ids = db
          .select({ id: table.id })
          .from(table)
          .where(eq(table.scope, scope))
          .limit(limit - deleted);
        const gone = await db
          .delete(table)
          .where(inArray(table.id, ids))
          .returning({ id: table.id });
        deleted += gone.length;
      }
      return deleted;
    },
  };
}
