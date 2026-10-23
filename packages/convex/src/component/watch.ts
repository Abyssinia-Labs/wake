// The watch calls (the spec's "Devices that watch"), behind the host's own
// wrappers (client `exposeWatchApi`), which give them their public names
// and check the agent's plan first. Each finds the device by its key's
// hash and answers for that device's agent only. A place key is looked for
// among devices and isn't there, so it opens none of them (principle 5).
import { ConvexError, v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server.js";
import { hashSecret, KEY_SHAPE } from "./keys.js";
import { tool } from "./schema.js";
import { ALERT_KINDS, isPush, isPushToken, pushArgs } from "./shape.js";
import { answerAsk } from "./summonses.js";
import { watchedOf, watchedPlace, watchedPlaceOf, watchedSummons } from "./watched.js";

/** Newest first, at most this many (the spec's `wake:runs`). */
const RUNS_LIMIT = 100;
const PLACES_LIMIT = 50;
/** Live Activities kept per device, newest last: one a run, and few run at once. */
const ACTIVITIES = 8;

async function deviceOf(ctx: QueryCtx | MutationCtx, key: string): Promise<Doc<"devices">> {
  if (!KEY_SHAPE.test(key)) throw new ConvexError("UNPAIRED");
  const keyHash = await hashSecret(key);
  const device = await ctx.db
    .query("devices")
    .withIndex("by_key_hash", (q) => q.eq("keyHash", keyHash))
    .unique();
  if (!device || device.forgottenAt !== undefined) throw new ConvexError("UNPAIRED");
  return device;
}

/** A call whose arguments break a rule changes nothing (the spec's "The watch calls"). */
function invalid(): never {
  throw new ConvexError("INVALID_BODY");
}

/** Who a watch key watches: what the host's wrapper reads the plan by, and `wake:watching`'s answer. */
export const device = query({
  args: { key: v.string() },
  returns: v.object({
    agent: v.string(),
    agentName: v.string(),
    tool: v.optional(tool),
    owner: v.string(),
    scope: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const device = await deviceOf(ctx, args.key);
    return {
      agent: device.agent,
      agentName: device.agentName,
      ...(device.tool === undefined ? {} : { tool: device.tool }),
      owner: device.owner,
      ...(device.scope === undefined ? {} : { scope: device.scope }),
    };
  },
});

/** wake:runs: the agent's summonses, newest first, asking ones included. No text. */
export const runs = query({
  args: { key: v.string(), app: v.string() },
  returns: v.array(watchedSummons),
  handler: async (ctx, args) => {
    const device = await deviceOf(ctx, args.key);
    const rows = await ctx.db
      .query("summonses")
      .withIndex("by_agent_at", (q) => q.eq("agent", device.agent))
      .order("desc")
      .take(RUNS_LIMIT);
    return await watchedOf(ctx, rows, args.app);
  },
});

/** wake:answer: the owner's yes or no, from their device, to an ask of the key's agent. */
export const answer = mutation({
  args: { key: v.string(), id: v.string(), yes: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await deviceOf(ctx, args.key);
    const id = ctx.db.normalizeId("summonses", args.id);
    const row = id ? await ctx.db.get(id) : null;
    // Answered already, not asking, or another agent's: nothing to do.
    if (row?.agent === device.agent) await answerAsk(ctx, row, args.yes);
    await ctx.db.patch(device._id, { lastSeenAt: Date.now() });
    return null;
  },
});

/** wake:places: the agent's places that aren't forgotten, most recently paired first. */
export const places = query({
  args: { key: v.string() },
  returns: v.array(watchedPlace),
  handler: async (ctx, args) => {
    const device = await deviceOf(ctx, args.key);
    const places = await ctx.db
      .query("places")
      .withIndex("by_agent", (q) => q.eq("agent", device.agent))
      .order("desc")
      .take(200);
    return places
      .filter((place) => place.forgottenAt === undefined)
      .slice(0, PLACES_LIMIT)
      .map(watchedPlaceOf);
  },
});

/** wake:push: where this device takes alerts, and which. A later call replaces it. */
export const push = mutation({
  args: { key: v.string(), ...pushArgs },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await deviceOf(ctx, args.key);
    if (!isPush(args, device.platform)) invalid();
    const { apns, liveActivity, webPush } = args;
    await ctx.db.patch(device._id, {
      push: {
        kinds: ALERT_KINDS.filter((kind) => args.kinds.includes(kind)),
        ...(apns
          ? {
              apns: {
                token: apns.token,
                environment: apns.environment === "development" ? "development" : "production",
              },
            }
          : {}),
        ...(liveActivity ? { liveActivity } : {}),
        ...(webPush ? { webPush } : {}),
      },
      lastSeenAt: Date.now(),
    });
    return null;
  },
});

/** wake:activity: a Live Activity's own update token, for one summons of the key's agent. */
export const activity = mutation({
  args: { key: v.string(), id: v.string(), pushToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await deviceOf(ctx, args.key);
    if (!isPushToken(args.pushToken)) invalid();
    const id = ctx.db.normalizeId("summonses", args.id);
    const row = id ? await ctx.db.get(id) : null;
    if (row?.agent !== device.agent) return null;
    const now = Date.now();
    const others = (device.activities ?? []).filter((one) => one.summons !== row._id);
    await ctx.db.patch(device._id, {
      activities: [...others, { summons: row._id, token: args.pushToken, at: now }].slice(
        -ACTIVITIES,
      ),
      lastSeenAt: now,
    });
    return null;
  },
});
