// Deleting a host's tenant (a workspace, an account): everything the
// component keeps for that scope, in batches small enough for one
// mutation. The host calls it until it answers `done`, from its own
// deletion steps.
import { v } from "convex/values";
import { mutation } from "./_generated/server.js";

const BATCH = 200;

export const deleteScope = mutation({
  args: { scope: v.string() },
  returns: v.object({ deleted: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    let deleted = 0;
    for (const table of ["summonses", "codes", "places"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_scope", (q) => q.eq("scope", args.scope))
        .take(BATCH - deleted);
      for (const row of rows) await ctx.db.delete(row._id);
      deleted += rows.length;
      if (deleted >= BATCH) return { deleted, done: false };
    }
    return { deleted, done: true };
  },
});
