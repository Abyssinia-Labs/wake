// A summons as the host reads it back: the same shape from `forSubject`
// (where it was made) and `runs.forOwner` (what a person's agents did).
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel.js";
import { run, state, target } from "./schema.js";

export const summonsView = v.object({
  id: v.string(),
  agent: v.string(),
  owner: v.string(),
  askedBy: v.string(),
  scope: v.optional(v.string()),
  subject: v.string(),
  kind: v.string(),
  target,
  state,
  at: v.number(),
  updatedAt: v.number(),
  reason: v.optional(v.string()),
  unclaimed: v.boolean(),
  /** Its run once Wake said it started. `session` is the owner's to see. */
  run: v.optional(run),
});

export function viewOf(row: Doc<"summonses">) {
  return {
    id: row._id,
    agent: row.agent,
    owner: row.owner,
    askedBy: row.askedBy,
    ...(row.scope === undefined ? {} : { scope: row.scope }),
    subject: row.subject,
    kind: row.kind,
    target: row.target,
    state: row.state,
    at: row.at,
    updatedAt: row.updatedAt,
    ...(row.reason === undefined ? {} : { reason: row.reason }),
    unclaimed: row.state === "open" && row.noticedAt !== undefined,
    ...(row.run === undefined ? {} : { run: row.run }),
  };
}
