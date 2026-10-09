// What the host does with summonses (the spec's "A summons's life"): make
// one when a person asks, let the owner answer one someone else made, and
// settle the waiting ones that stop being wanted. The host decides what
// asks (an assignment, a mention); the component keeps the rules.
import { v } from "convex/values";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import { internalMutation, type MutationCtx, mutation, query } from "./_generated/server.js";
import { run, state, target } from "./schema.js";
import { checkSummons } from "./shape.js";

/** The spec's "nothing has claimed it in thirty minutes". */
export const UNCLAIMED_MS = 30 * 60_000;
const LIVE = ["asking", "open", "claimed"] as const;

async function liveFor(
  ctx: MutationCtx,
  subject: string,
  agent?: string,
): Promise<Doc<"summonses">[]> {
  const rows = await ctx.db
    .query("summonses")
    .withIndex("by_subject_agent", (q) =>
      agent === undefined ? q.eq("subject", subject) : q.eq("subject", subject).eq("agent", agent),
    )
    .take(200);
  return rows.filter((row) => (LIVE as readonly string[]).includes(row.state));
}

async function open(ctx: MutationCtx, id: Id<"summonses">, now: number): Promise<void> {
  await ctx.db.patch(id, { state: "open", updatedAt: now });
  await ctx.scheduler.runAfter(UNCLAIMED_MS, internal.summonses.noticeUnclaimed, { id });
}

/**
 * A person asked `agent` about `subject`. The owner asking opens it; anyone
 * else's ask waits for the owner (`answer`). A live one for the same agent
 * and subject is joined, not doubled. Only call it for a person's action:
 * an agent's own write never summons.
 */
export const summon = mutation({
  args: {
    agent: v.string(),
    owner: v.string(),
    askedBy: v.string(),
    scope: v.optional(v.string()),
    subject: v.string(),
    kind: v.string(),
    target,
    repo: v.optional(v.string()),
    branch: v.optional(v.string()),
    prompt: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    checkSummons(args);
    const now = Date.now();
    const [live] = await liveFor(ctx, args.subject, args.agent);
    if (live) {
      await ctx.db.patch(live._id, { updatedAt: now });
      // The owner asking again is the yes a waiting one needed.
      if (live.state === "asking" && args.askedBy === live.owner) await open(ctx, live._id, now);
      return live._id;
    }
    const id = await ctx.db.insert("summonses", {
      ...args,
      state: "asking",
      at: now,
      updatedAt: now,
    });
    if (args.askedBy === args.owner) await open(ctx, id, now);
    return id;
  },
});

/** The owner's answer to a summons someone else made. The host checks it is the owner. */
export const answer = mutation({
  args: { id: v.string(), yes: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("summonses", args.id);
    const row = id ? await ctx.db.get(id) : null;
    if (row?.state !== "asking") return null;
    const now = Date.now();
    if (args.yes) await open(ctx, row._id, now);
    else
      await ctx.db.patch(row._id, {
        state: "dropped",
        reason: "The owner said no.",
        updatedAt: now,
      });
    return null;
  },
});

/**
 * Ends what still waits about `subject`, for one agent or every agent (and
 * one kind or every kind): unassigned, closed, answered from a live
 * session. A claimed one is its run's to end. Answers how many it ended.
 */
export const settle = mutation({
  args: {
    subject: v.string(),
    agent: v.optional(v.string()),
    kind: v.optional(v.string()),
    state: v.union(v.literal("done"), v.literal("dropped")),
    reason: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const now = Date.now();
    let ended = 0;
    for (const row of await liveFor(ctx, args.subject, args.agent)) {
      if (row.state === "claimed" || (args.kind !== undefined && row.kind !== args.kind)) continue;
      await ctx.db.patch(row._id, {
        state: args.state,
        reason: args.reason.slice(0, 300),
        updatedAt: now,
      });
      ended += 1;
    }
    return ended;
  },
});

const summonsView = v.object({
  id: v.string(),
  agent: v.string(),
  owner: v.string(),
  askedBy: v.string(),
  kind: v.string(),
  state,
  at: v.number(),
  updatedAt: v.number(),
  reason: v.optional(v.string()),
  unclaimed: v.boolean(),
  /** Its run once Wake said it started. `session` is the owner's to see. */
  run: v.optional(run),
});

/** Each agent's latest summons about `subject`, for the host to show where it was made. */
export const forSubject = query({
  args: { subject: v.string() },
  returns: v.array(summonsView),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("summonses")
      .withIndex("by_subject_agent", (q) => q.eq("subject", args.subject))
      .take(500);
    const latest = new Map<string, Doc<"summonses">>();
    for (const row of rows) {
      const seen = latest.get(row.agent);
      if (!seen || row.updatedAt > seen.updatedAt) latest.set(row.agent, row);
    }
    return [...latest.values()].map((row) => ({
      id: row._id,
      agent: row.agent,
      owner: row.owner,
      askedBy: row.askedBy,
      kind: row.kind,
      state: row.state,
      at: row.at,
      updatedAt: row.updatedAt,
      ...(row.reason === undefined ? {} : { reason: row.reason }),
      unclaimed: row.state === "open" && row.noticedAt !== undefined,
      ...(row.run === undefined ? {} : { run: row.run }),
    }));
  },
});

/** Half an hour after it opened: if nothing has claimed it, it says so (`unclaimed`). */
export const noticeUnclaimed = internalMutation({
  args: { id: v.id("summonses") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    if (row?.state === "open" && row.noticedAt === undefined) {
      await ctx.db.patch(row._id, { noticedAt: Date.now() });
    }
    return null;
  },
});
