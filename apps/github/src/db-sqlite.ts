// The bridge's own table on SQLite, for Cloudflare D1: the same record as
// db.ts keeps on Postgres, which issue each summons is about and its status
// comment.
import { eq } from "drizzle-orm";
import { type BaseSQLiteDatabase, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { Asks } from "./db";

export const githubAsksSqlite = sqliteTable("github_asks", {
  summons: text("summons").primaryKey(),
  installation: integer("installation").notNull(),
  repo: text("repo").notNull(),
  number: integer("number").notNull(),
  asker: text("asker").notNull(),
  statusComment: integer("status_comment"),
});

export function asksInSqlite<R, S extends Record<string, unknown>>(
  db: BaseSQLiteDatabase<"async", R, S>,
): Asks {
  return {
    async keep(row) {
      await db.insert(githubAsksSqlite).values(row).onConflictDoNothing();
    },
    async get(summons) {
      const [row] = await db
        .select()
        .from(githubAsksSqlite)
        .where(eq(githubAsksSqlite.summons, summons));
      return row ?? null;
    },
    async setStatusComment(summons, id) {
      await db
        .update(githubAsksSqlite)
        .set({ statusComment: id })
        .where(eq(githubAsksSqlite.summons, summons));
    },
  };
}
