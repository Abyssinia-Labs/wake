// wake:pending, wake:claim and wake:finish, and the optional wake:started
// and wake:waiting (the spec's "The functions"), behind the host's own
// wrappers (client `exposeApi`), which give them their public names and the
// app's name. Each finds the place by its key's hash and answers for that
// place's agent only.
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server.js";
import { hashSecret, KEY_SHAPE } from "./keys.js";
import { target, tool } from "./schema.js";
import { isRunReport } from "./shape.js";

/** Oldest first, at most this many: Wake runs two at a time. */
const PENDING_LIMIT = 50;

async function placeOf(ctx: QueryCtx | MutationCtx, key: string): Promise<Doc<"places">> {
  if (!KEY_SHAPE.test(key)) throw new ConvexError("UNPAIRED");
  const keyHash = await hashSecret(key);
  const place = await ctx.db
    .query("places")
    .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
    .unique();
  if (!place || place.forgottenAt !== undefined) throw new ConvexError("UNPAIRED");
  return place;
}

/** The summons `id` while this place's claim on it stands; null for any other. */
async function claimedBy(
  ctx: MutationCtx,
  place: Doc<"places">,
  id: string,
): Promise<Doc<"summonses"> | null> {
  const found = ctx.db.normalizeId("summonses", id);
  const row = found ? await ctx.db.get(found) : null;
  return row?.place === place._id && row.state === "claimed" ? row : null;
}

const pendingSummons = v.object({
  id: v.string(),
  app: v.string(),
  kind: v.string(),
  target,
  repo: v.optional(v.string()),
  branch: v.optional(v.string()),
  at: v.number(),
});

/** wake:pending: the place's agent's open summonses, oldest first. No text. */
export const pending = query({
  args: { key: v.string(), app: v.string() },
  returns: v.array(pendingSummons),
  handler: async (ctx, args) => {
    const place = await placeOf(ctx, args.key);
    const rows = await ctx.db
      .query("summonses")
      .withIndex("by_agent_state", (q) => q.eq("agent", place.agent).eq("state", "open"))
      .take(PENDING_LIMIT);
    return rows.map((row) => ({
      id: row._id,
      app: args.app,
      kind: row.kind,
      target: row.target,
      ...(row.repo && row.branch ? { repo: row.repo, branch: row.branch } : {}),
      at: row.at,
    }));
  },
});

/** wake:claim: the first place to ask wins; every other is told it lost. */
export const claim = mutation({
  args: { key: v.string(), id: v.string() },
  returns: v.union(
    v.object({ claimed: v.literal(true), run: v.object({ prompt: v.string() }) }),
    v.object({ claimed: v.literal(false) }),
  ),
  handler: async (ctx, args) => {
    const place = await placeOf(ctx, args.key);
    const id = ctx.db.normalizeId("summonses", args.id);
    const row = id ? await ctx.db.get(id) : null;
    if (!row || row.agent !== place.agent || row.state !== "open")
      return { claimed: false as const };
    const now = Date.now();
    await ctx.db.patch(row._id, {
      state: "claimed",
      place: place._id,
      claimedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(place._id, { lastSeenAt: now, lastClaimAt: now });
    return { claimed: true as const, run: { prompt: row.prompt } };
  },
});

/**
 * wake:started: the agent is running, under a name people see and the
 * session its owner resumes. A later call for the same run replaces the
 * first (the session id of Codex and Cursor comes after they start).
 */
export const started = mutation({
  args: {
    key: v.string(),
    id: v.string(),
    run: v.object({ name: v.string(), tool, session: v.optional(v.string()) }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const place = await placeOf(ctx, args.key);
    const row = await claimedBy(ctx, place, args.id);
    if (!row || !isRunReport(args.run)) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      run: {
        name: args.run.name,
        tool: args.run.tool,
        ...(args.run.session === undefined ? {} : { session: args.run.session }),
        machine: place.machine,
        startedAt: row.run?.startedAt ?? now,
      },
      updatedAt: now,
    });
    await ctx.db.patch(place._id, { lastSeenAt: now });
    return null;
  },
});

/** wake:finish: what became of a run this place claimed. */
export const finish = mutation({
  args: {
    key: v.string(),
    id: v.string(),
    outcome: v.union(v.literal("done"), v.literal("failed")),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const place = await placeOf(ctx, args.key);
    // Another place's run, or one already finished: nothing of this place's to end.
    const row = await claimedBy(ctx, place, args.id);
    if (!row) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, {
      state: args.outcome,
      finishedAt: now,
      updatedAt: now,
      ...(args.reason ? { reason: args.reason.slice(0, 300) } : {}),
    });
    await ctx.db.patch(place._id, { lastSeenAt: now });
    return null;
  },
});

/**
 * wake:waiting: the run this place claimed stops on a question for its
 * owner, or goes on. Not a word of the question: it stays on the machine,
 * and the owner's devices see only that it waits (`wake:runs`).
 */
export const waiting = mutation({
  args: { key: v.string(), id: v.string(), waiting: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const place = await placeOf(ctx, args.key);
    const row = await claimedBy(ctx, place, args.id);
    if (!row) return null;
    const now = Date.now();
    await ctx.db.patch(row._id, { waiting: args.waiting, updatedAt: now });
    await ctx.db.patch(place._id, { lastSeenAt: now });
    return null;
  },
});
