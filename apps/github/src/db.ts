// The bridge's own table, beside wake-server's: which GitHub issue or pull
// request each summons is about, under which installation, who asked, and
// the one status comment the run's progress is written into.
import { and, eq } from "drizzle-orm";
import {
  bigint,
  integer,
  type PgDatabase,
  type PgQueryResultHKT,
  pgTable,
  text,
} from "drizzle-orm/pg-core";

export const githubAsks = pgTable("github_asks", {
  summons: text("summons").primaryKey(),
  installation: bigint("installation", { mode: "number" }).notNull(),
  repo: text("repo").notNull(),
  number: integer("number").notNull(),
  asker: text("asker").notNull(),
  statusComment: bigint("status_comment", { mode: "number" }),
});

export const GITHUB_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS github_asks (
  summons text PRIMARY KEY, installation bigint NOT NULL, repo text NOT NULL,
  number integer NOT NULL, asker text NOT NULL, status_comment bigint
);
`;

export type AskRow = typeof githubAsks.$inferSelect;

export type Asks = {
  /** Kept once per summons: a second ask that joins it keeps the first record. */
  keep(row: Omit<AskRow, "statusComment">): Promise<void>;
  get(summons: string): Promise<AskRow | null>;
  setStatusComment(summons: string, id: number): Promise<void>;
};

export function asksIn<H extends PgQueryResultHKT, S extends Record<string, unknown>>(
  db: PgDatabase<H, S>,
): Asks {
  return {
    async keep(row) {
      await db.insert(githubAsks).values(row).onConflictDoNothing();
    },
    async get(summons) {
      const [row] = await db.select().from(githubAsks).where(eq(githubAsks.summons, summons));
      return row ?? null;
    },
    async setStatusComment(summons, id) {
      await db
        .update(githubAsks)
        .set({ statusComment: id })
        .where(and(eq(githubAsks.summons, summons)));
    },
  };
}
