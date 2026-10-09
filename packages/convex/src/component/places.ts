// Places and pairing (the spec's "Pairing"). The secrets are made and
// hashed by the caller, in an action or HTTP action (keys.ts says why);
// these store and compare hashes only.
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { tool } from "./schema.js";

/** A host's pair code for its agent: the hash, kept ten minutes, one use. */
export const storeCode = mutation({
  args: {
    agent: v.string(),
    agentName: v.string(),
    owner: v.string(),
    scope: v.optional(v.string()),
    tool: v.optional(tool),
    codeHash: v.string(),
    expiresAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("codes", args);
    return null;
  },
});

/** `POST /wake/v1/pair`: one use of a live code makes the place. */
export const pair = mutation({
  args: { codeHash: v.string(), keyHash: v.string(), machine: v.string(), platform: v.string() },
  returns: v.object({ agent: v.string(), agentName: v.string(), tool: v.optional(tool) }),
  handler: async (ctx, args) => {
    const code = await ctx.db
      .query("codes")
      .withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    const now = Date.now();
    if (!code || code.usedAt !== undefined || code.expiresAt < now) {
      throw new ConvexError("CODE_INVALID");
    }
    await ctx.db.patch(code._id, { usedAt: now });
    await ctx.db.insert("places", {
      agent: code.agent,
      owner: code.owner,
      ...(code.scope === undefined ? {} : { scope: code.scope }),
      ...(code.tool === undefined ? {} : { tool: code.tool }),
      machine: args.machine,
      platform: args.platform,
      keyHash: args.keyHash,
      pairedAt: now,
    });
    return {
      agent: code.agent,
      agentName: code.agentName,
      ...(code.tool === undefined ? {} : { tool: code.tool }),
    };
  },
});

/** `POST /wake/v1/forget`: the key stops working. False when it already had. */
export const forget = mutation({
  args: { keyHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const place = await ctx.db
      .query("places")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.keyHash))
      .unique();
    if (!place || place.forgottenAt !== undefined) return false;
    await ctx.db.patch(place._id, { forgottenAt: Date.now() });
    return true;
  },
});

const placeView = v.object({
  id: v.string(),
  machine: v.string(),
  platform: v.string(),
  tool: v.optional(tool),
  pairedAt: v.number(),
  lastSeenAt: v.optional(v.number()),
});

/** The machines an agent can be started on, for the host's screens. */
export const list = query({
  args: { agent: v.string() },
  returns: v.array(placeView),
  handler: async (ctx, args) => {
    const places = await ctx.db
      .query("places")
      .withIndex("by_agent", (q) => q.eq("agent", args.agent))
      .take(100);
    return places
      .filter((place) => place.forgottenAt === undefined)
      .map((place) => ({
        id: place._id,
        machine: place.machine,
        platform: place.platform,
        ...(place.tool === undefined ? {} : { tool: place.tool }),
        pairedAt: place.pairedAt,
        ...(place.lastSeenAt === undefined ? {} : { lastSeenAt: place.lastSeenAt }),
      }));
  },
});

/** Forget one machine from a screen; the host checks who may. */
export const remove = mutation({
  args: { agent: v.string(), place: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("places", args.place);
    const place = id ? await ctx.db.get(id) : null;
    if (!place || place.agent !== args.agent || place.forgottenAt !== undefined) return false;
    await ctx.db.patch(place._id, { forgottenAt: Date.now() });
    return true;
  },
});

/**
 * An agent the host revoked: its places stop working, its codes can't be
 * used, and what waits for it is dropped. Call it wherever the host
 * revokes the agent, in the same mutation.
 */
export const revokeAgent = mutation({
  args: { agent: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const place of await ctx.db
      .query("places")
      .withIndex("by_agent", (q) => q.eq("agent", args.agent))
      .take(500)) {
      if (place.forgottenAt === undefined) await ctx.db.patch(place._id, { forgottenAt: now });
    }
    for (const code of await ctx.db
      .query("codes")
      .withIndex("by_agent", (q) => q.eq("agent", args.agent))
      .take(500)) {
      if (code.usedAt === undefined) await ctx.db.patch(code._id, { usedAt: now });
    }
    for (const waiting of ["asking", "open"] as const) {
      for (const row of await ctx.db
        .query("summonses")
        .withIndex("by_agent_state", (q) => q.eq("agent", args.agent).eq("state", waiting))
        .take(500)) {
        await ctx.db.patch(row._id, {
          state: "dropped",
          reason: "The agent was revoked.",
          updatedAt: now,
        });
      }
    }
    return null;
  },
});
