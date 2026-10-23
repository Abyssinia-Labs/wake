// Devices that watch (the spec's "Devices that watch"), as the host and the
// watch route see them: the watch code, made only for an agent's owner in
// the host's own interface; the device one use of it makes; the owner's
// list of them; and where alerts go. The secrets are made and hashed by
// the caller, in an action or HTTP action, as for places (keys.ts says why).
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server.js";
import { alertKind, platform, pushRegistration, tool } from "./schema.js";

/**
 * A watch code for an agent's owner, signed in to the host: the hash, kept
 * ten minutes, one use. No call of wake/v1 reaches it (principle 5).
 */
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
    await ctx.db.insert("watchCodes", args);
    return null;
  },
});

/** `POST /wake/v1/watch`: one use of a live watch code makes the device. */
export const watch = mutation({
  args: { codeHash: v.string(), keyHash: v.string(), name: v.string(), platform },
  returns: v.object({ agent: v.string(), agentName: v.string(), tool: v.optional(tool) }),
  handler: async (ctx, args) => {
    const code = await ctx.db
      .query("watchCodes")
      .withIndex("by_code_hash", (q) => q.eq("codeHash", args.codeHash))
      .unique();
    const now = Date.now();
    if (!code || code.usedAt !== undefined || code.expiresAt < now) {
      throw new ConvexError("CODE_INVALID");
    }
    await ctx.db.patch(code._id, { usedAt: now });
    await ctx.db.insert("devices", {
      agent: code.agent,
      agentName: code.agentName,
      owner: code.owner,
      ...(code.scope === undefined ? {} : { scope: code.scope }),
      ...(code.tool === undefined ? {} : { tool: code.tool }),
      name: args.name,
      platform: args.platform,
      keyHash: args.keyHash,
      madeAt: now,
    });
    return {
      agent: code.agent,
      agentName: code.agentName,
      ...(code.tool === undefined ? {} : { tool: code.tool }),
    };
  },
});

/** `POST /wake/v1/forget` with a watch key: the device stops watching. False when it already had. */
export const forget = mutation({
  args: { keyHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("by_key_hash", (q) => q.eq("keyHash", args.keyHash))
      .unique();
    if (!device || device.forgottenAt !== undefined) return false;
    await ctx.db.patch(device._id, { forgottenAt: Date.now() });
    return true;
  },
});

const deviceView = v.object({
  id: v.string(),
  name: v.string(),
  platform,
  madeAt: v.number(),
  lastSeenAt: v.optional(v.number()),
  /** The alerts it takes (`wake:push`); none until it asks. */
  alerts: v.array(alertKind),
});

/** The devices watching an agent, newest first, for the owner's list in the host. */
export const list = query({
  args: { agent: v.string() },
  returns: v.array(deviceView),
  handler: async (ctx, args) => {
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_agent", (q) => q.eq("agent", args.agent))
      .order("desc")
      .take(100);
    return devices
      .filter((device) => device.forgottenAt === undefined)
      .map((device) => ({
        id: device._id,
        name: device.name,
        platform: device.platform,
        madeAt: device.madeAt,
        ...(device.lastSeenAt === undefined ? {} : { lastSeenAt: device.lastSeenAt }),
        alerts: device.push?.kinds ?? [],
      }));
  },
});

/** The owner removed a device in the host: its key opens nothing after. The host checks who may. */
export const remove = mutation({
  args: { agent: v.string(), device: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("devices", args.device);
    const device = id ? await ctx.db.get(id) : null;
    if (!device || device.agent !== args.agent || device.forgottenAt !== undefined) return false;
    await ctx.db.patch(device._id, { forgottenAt: Date.now() });
    return true;
  },
});

const { apns, liveActivity, webPush } = pushRegistration.fields;

/**
 * Where an alert of `kind` about the agent goes: each device that asked for
 * that kind, how to reach it, and, given `summons`, that summons's Live
 * Activity token on the device. An alert carries no text (the spec's
 * `wake:push`). The host sends only while its plan includes alerts.
 */
export const alertTargets = query({
  args: { agent: v.string(), kind: alertKind, summons: v.optional(v.string()) },
  returns: v.array(
    v.object({
      device: v.string(),
      platform,
      apns,
      liveActivity,
      webPush,
      activityToken: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const devices = await ctx.db
      .query("devices")
      .withIndex("by_agent", (q) => q.eq("agent", args.agent))
      .take(100);
    const out = [];
    for (const device of devices) {
      const push = device.push;
      if (device.forgottenAt !== undefined || !push?.kinds.includes(args.kind)) continue;
      const activity = device.activities?.find((one) => one.summons === args.summons);
      out.push({
        device: device._id,
        platform: device.platform,
        ...(push.apns ? { apns: push.apns } : {}),
        ...(push.liveActivity ? { liveActivity: push.liveActivity } : {}),
        ...(push.webPush ? { webPush: push.webPush } : {}),
        ...(activity ? { activityToken: activity.token } : {}),
      });
    }
    return out;
  },
});
