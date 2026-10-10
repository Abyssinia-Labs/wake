// The server half's storage on Postgres through Drizzle. Each change of
// state is one conditional UPDATE (`... WHERE state IN (...) RETURNING`),
// so two places claiming at once can't both win, with no lock held. Works
// with any Drizzle Postgres driver: node-postgres, postgres.js, Neon,
// PGlite.
import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { CodeRow, PlaceRow, State, SummonsPatch, SummonsRow, WakeStore } from "../store";
import { wakeCodes, wakePlaces, wakeSummonses } from "./schema";

/** Drizzle answers null for an empty column; the store's rows leave it out. */
function present<T extends Record<string, unknown>>(
  row: T,
): { [K in keyof T]: Exclude<T[K], null> } {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) if (value !== null) out[key] = value;
  return out as { [K in keyof T]: Exclude<T[K], null> };
}

export function drizzleStore<H extends PgQueryResultHKT, S extends Record<string, unknown>>(
  db: PgDatabase<H, S>,
): WakeStore {
  const place = (row: typeof wakePlaces.$inferSelect): PlaceRow => present(row);
  const code = (row: typeof wakeCodes.$inferSelect): CodeRow => present(row);
  const summons = (row: typeof wakeSummonses.$inferSelect): SummonsRow => present(row);

  return {
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
      await db
        .update(wakePlaces)
        .set({ forgottenAt: now })
        .where(and(eq(wakePlaces.agent, agent), isNull(wakePlaces.forgottenAt)));
      await db
        .update(wakeCodes)
        .set({ usedAt: now })
        .where(and(eq(wakeCodes.agent, agent), isNull(wakeCodes.usedAt)));
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
    async summonsesOwnedBy(owner, limit) {
      const rows = await db
        .select()
        .from(wakeSummonses)
        .where(eq(wakeSummonses.owner, owner))
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
      for (const table of [wakeSummonses, wakeCodes, wakePlaces] as const) {
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
