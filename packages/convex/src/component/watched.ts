// A summons and a place as the owner's devices see them (`wake:runs`,
// `wake:places`): the pending fields, where it stands, who asked while it
// asks, its run and the place that claimed it. Never the prompt, a path or
// the text that asked (principle 1): a device reads that in the app.
import { type Infer, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.js";
import type { QueryCtx } from "./_generated/server.js";
import { state, target, tool } from "./schema.js";
import { cleanName } from "./shape.js";

export const watchedSummons = v.object({
  id: v.string(),
  app: v.string(),
  kind: v.string(),
  target,
  repo: v.optional(v.string()),
  branch: v.optional(v.string()),
  at: v.number(),
  state,
  asker: v.optional(v.object({ name: v.string() })),
  run: v.optional(
    v.object({
      name: v.string(),
      tool,
      session: v.optional(v.string()),
      startedAt: v.number(),
    }),
  ),
  place: v.optional(v.object({ name: v.string() })),
  waiting: v.optional(v.boolean()),
  endedAt: v.optional(v.number()),
  reason: v.optional(v.string()),
});

export const watchedPlace = v.object({
  name: v.string(),
  platform: v.string(),
  pairedAt: v.number(),
  lastClaimAt: v.optional(v.number()),
});

/** Who asks, when the host didn't say: an ask can't be shown without a name. */
const SOMEONE = "Someone";
const ENDED: readonly string[] = ["done", "failed", "dropped"];

/** Rows as a device sees them, each place read once however many runs it claimed. */
export async function watchedOf(
  ctx: QueryCtx,
  rows: Doc<"summonses">[],
  app: string,
): Promise<Infer<typeof watchedSummons>[]> {
  const names = new Map<Id<"places">, string>();
  const nameOf = async (id: Id<"places">): Promise<string> => {
    const known = names.get(id);
    if (known !== undefined) return known;
    const name = cleanName((await ctx.db.get(id))?.machine ?? "");
    names.set(id, name);
    return name;
  };
  const out: Infer<typeof watchedSummons>[] = [];
  for (const row of rows) {
    const run = row.run;
    out.push({
      id: row._id,
      app,
      kind: row.kind,
      target: row.target,
      ...(row.repo && row.branch ? { repo: row.repo, branch: row.branch } : {}),
      at: row.at,
      state: row.state,
      // Said only while it asks: the owner decides on a name, and needs no more.
      ...(row.state === "asking" ? { asker: { name: row.askerName ?? SOMEONE } } : {}),
      ...(run
        ? {
            run: {
              name: run.name,
              tool: run.tool,
              ...(run.session === undefined ? {} : { session: run.session }),
              startedAt: run.startedAt,
            },
          }
        : {}),
      ...(row.place ? { place: { name: await nameOf(row.place) } } : {}),
      ...(row.state === "claimed" && row.waiting ? { waiting: true } : {}),
      // Nothing changes an ended summons, so its last change is when it ended.
      ...(ENDED.includes(row.state) ? { endedAt: row.finishedAt ?? row.updatedAt } : {}),
      ...(row.reason === undefined ? {} : { reason: row.reason }),
    });
  }
  return out;
}

export function watchedPlaceOf(place: Doc<"places">): Infer<typeof watchedPlace> {
  return {
    name: cleanName(place.machine),
    platform: place.platform,
    pairedAt: place.pairedAt,
    ...(place.lastClaimAt === undefined ? {} : { lastClaimAt: place.lastClaimAt }),
  };
}
