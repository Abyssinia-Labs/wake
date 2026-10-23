// The server half of wake/v1 (docs/spec/wake-v1.md), as tables a host app
// never touches directly. Ids from the host (its agents, people, tickets)
// cross the component boundary as strings: `agent`, `owner`, `subject`.
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const tool = v.union(v.literal("claude"), v.literal("codex"), v.literal("cursor"));
export const state = v.union(
  v.literal("asking"),
  v.literal("open"),
  v.literal("claimed"),
  v.literal("done"),
  v.literal("failed"),
  v.literal("dropped"),
);
export const target = v.object({ kind: v.string(), ref: v.string(), url: v.string() });
/** What `wake:started` says about a claimed summons's run. */
export const run = v.object({
  name: v.string(),
  tool,
  session: v.optional(v.string()),
  machine: v.string(),
  startedAt: v.number(),
});
/** What a device is (the spec's "Devices that watch"): it watches and answers, and never claims. */
export const platform = v.union(v.literal("ios"), v.literal("darwin"), v.literal("web"));
export const alertKind = v.union(
  v.literal("ask"),
  v.literal("waiting"),
  v.literal("started"),
  v.literal("done"),
  v.literal("failed"),
);
/** Where a device takes alerts (`wake:push`): APNs from `ios` and `darwin`, Web Push from `web`. */
export const pushRegistration = v.object({
  kinds: v.array(alertKind),
  apns: v.optional(
    v.object({
      token: v.string(),
      environment: v.union(v.literal("production"), v.literal("development")),
    }),
  ),
  liveActivity: v.optional(v.object({ pushToStartToken: v.string() })),
  webPush: v.optional(
    v.object({ endpoint: v.string(), keys: v.object({ p256dh: v.string(), auth: v.string() }) }),
  ),
});
/** A code's row, for a place (`codes`) or a device (`watchCodes`): the hash, ten minutes, one use. */
const code = {
  agent: v.string(),
  agentName: v.string(),
  owner: v.string(),
  scope: v.optional(v.string()),
  tool: v.optional(tool),
  codeHash: v.string(),
  expiresAt: v.number(),
  usedAt: v.optional(v.number()),
};

export default defineSchema({
  // Wake on one machine, paired to one agent. Its key is kept as a hash.
  places: defineTable({
    agent: v.string(),
    owner: v.string(),
    /** The host's tenant (a workspace), when it has one. */
    scope: v.optional(v.string()),
    tool: v.optional(tool),
    machine: v.string(),
    platform: v.string(),
    keyHash: v.string(),
    pairedAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    /** When it last won a claim, for its owner's devices (`wake:places`). */
    lastClaimAt: v.optional(v.number()),
    forgottenAt: v.optional(v.number()),
  })
    .index("by_key_hash", ["keyHash"])
    .index("by_agent", ["agent"])
    .index("by_scope", ["scope"]),

  // A pair code: one use, ten minutes, kept as a hash.
  codes: defineTable(code)
    .index("by_code_hash", ["codeHash"])
    .index("by_agent", ["agent"])
    .index("by_scope", ["scope"]),

  // A watch code, made only in the host's own interface for the agent's
  // signed-in owner (principle 5). Apart from pair codes, so neither opens
  // the other's door.
  watchCodes: defineTable(code)
    .index("by_code_hash", ["codeHash"])
    .index("by_agent", ["agent"])
    .index("by_scope", ["scope"]),

  // Something the owner watches the agent on: a phone, a browser, a Mac.
  // Its watch key is kept as a hash, as a place's is.
  devices: defineTable({
    agent: v.string(),
    agentName: v.string(),
    owner: v.string(),
    scope: v.optional(v.string()),
    tool: v.optional(tool),
    name: v.string(),
    platform,
    keyHash: v.string(),
    madeAt: v.number(),
    lastSeenAt: v.optional(v.number()),
    forgottenAt: v.optional(v.number()),
    push: v.optional(pushRegistration),
    /** Each Live Activity's own update token (`wake:activity`), the latest few. */
    activities: v.optional(
      v.array(v.object({ summons: v.string(), token: v.string(), at: v.number() })),
    ),
  })
    .index("by_key_hash", ["keyHash"])
    .index("by_agent", ["agent"])
    .index("by_scope", ["scope"]),

  // One ask of one agent about one subject (the host's ticket or page).
  summonses: defineTable({
    agent: v.string(),
    owner: v.string(),
    askedBy: v.string(),
    /** Who asked, as the owner's devices show an ask. */
    askerName: v.optional(v.string()),
    scope: v.optional(v.string()),
    /** The host's id for what it is about: one live summons per agent per subject. */
    subject: v.string(),
    kind: v.string(),
    target,
    repo: v.optional(v.string()),
    branch: v.optional(v.string()),
    /** What a winning claim hands the agent: tools to call, never the text that asked. */
    prompt: v.string(),
    state,
    at: v.number(),
    updatedAt: v.number(),
    reason: v.optional(v.string()),
    /** Set when an open one has waited thirty minutes unclaimed. */
    noticedAt: v.optional(v.number()),
    place: v.optional(v.id("places")),
    claimedAt: v.optional(v.number()),
    /** Its run, once Wake says the agent is running (`wake:started`). */
    run: v.optional(run),
    /** True while its claimed run waits on its owner (`wake:waiting`). */
    waiting: v.optional(v.boolean()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_subject_agent", ["subject", "agent", "state"])
    .index("by_agent_state", ["agent", "state", "at"])
    .index("by_agent_at", ["agent", "at"])
    .index("by_owner_state", ["owner", "state", "at"])
    .index("by_owner_updated", ["owner", "updatedAt"])
    .index("by_scope", ["scope"]),
});
