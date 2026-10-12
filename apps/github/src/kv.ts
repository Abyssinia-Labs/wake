// The bridge's small records beside its asks (WAK-22, WAK-23): each GitHub
// account it has seen, its plan, its policy, kept as JSON by key in one
// table, on Postgres or D1 alike. A handful of rows per organisation.
import { eq } from "drizzle-orm";
import {
  type PgDatabase,
  type PgQueryResultHKT,
  pgTable,
  text as pgText,
} from "drizzle-orm/pg-core";
import { type BaseSQLiteDatabase, sqliteTable, text } from "drizzle-orm/sqlite-core";

export type Kv = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
};

export const githubKvPg = pgTable("github_kv", {
  key: pgText("key").primaryKey(),
  value: pgText("value").notNull(),
});
export const githubKvSqlite = sqliteTable("github_kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const GITHUB_KV_SQL =
  "CREATE TABLE IF NOT EXISTS github_kv (key text PRIMARY KEY, value text NOT NULL);";

function parsed(row: { value: string } | undefined): unknown {
  if (!row) return null;
  try {
    return JSON.parse(row.value) as unknown;
  } catch {
    return null;
  }
}

export function kvInPg<H extends PgQueryResultHKT, S extends Record<string, unknown>>(
  db: PgDatabase<H, S>,
): Kv {
  return {
    async get(key) {
      const [row] = await db.select().from(githubKvPg).where(eq(githubKvPg.key, key));
      return parsed(row);
    },
    async set(key, value) {
      const json = JSON.stringify(value);
      await db
        .insert(githubKvPg)
        .values({ key, value: json })
        .onConflictDoUpdate({ target: githubKvPg.key, set: { value: json } });
    },
  };
}

export function kvInSqlite<R, S extends Record<string, unknown>>(
  db: BaseSQLiteDatabase<"async", R, S>,
): Kv {
  return {
    async get(key) {
      const [row] = await db.select().from(githubKvSqlite).where(eq(githubKvSqlite.key, key));
      return parsed(row);
    },
    async set(key, value) {
      const json = JSON.stringify(value);
      await db
        .insert(githubKvSqlite)
        .values({ key, value: json })
        .onConflictDoUpdate({ target: githubKvSqlite.key, set: { value: json } });
    },
  };
}
