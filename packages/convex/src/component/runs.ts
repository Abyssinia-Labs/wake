// What a person's agents were asked and did, newest first, across every
// subject: for a host's own "runs" list (a top bar, later a phone), where a
// run's name, state and session sit outside the comment that asked.
import { v } from "convex/values";
import { query } from "./_generated/server.js";
import { summonsView, viewOf } from "./views.js";

const MOST = 50;
/** Rows read at most, so a person with many dropped or other-scope summonses costs a bounded read. */
const SCAN = 500;

/**
 * The owner's latest summonses, newest change first, at most `limit` (50),
 * in one scope when given. Dropped ones are left out: nothing ran. The
 * host checks the caller is `owner` first.
 */
export const forOwner = query({
  args: { owner: v.string(), scope: v.optional(v.string()), limit: v.optional(v.number()) },
  returns: v.array(summonsView),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, MOST));
    const out = [];
    const rows = await ctx.db
      .query("summonses")
      .withIndex("by_owner_updated", (q) => q.eq("owner", args.owner))
      .order("desc")
      .take(SCAN);
    for (const row of rows) {
      if (row.state === "dropped") continue;
      if (args.scope !== undefined && row.scope !== args.scope) continue;
      out.push(viewOf(row));
      if (out.length >= limit) break;
    }
    return out;
  },
});
