// The watch calls (the spec's "Devices that watch") under the names wake/v1
// gives them, for the host's `convex/wake.ts` beside `exposeApi`'s:
//
//   export const { runs, answer, places, watching, push, activity } =
//     exposeWatchApi(components.wake, { app: "acme", plan });
//
// The watch key is the credential, as the place key is for Wake's calls,
// and the component checks it. `plan` is the host's say on what an agent's
// plan includes, read from its own tables at each call; without it,
// everything is included (an app without plans).
import {
  type GenericDataModel,
  type GenericQueryCtx,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import { ConvexError, v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import { APP, type Inclusion, NOT_IN_PLAN, pushArgs } from "../component/shape.js";

/** What an agent's plan includes: devices that watch, and alerts sent to them. */
export type Plan = { devices: Inclusion; alerts: Inclusion };
/** Whose plan: the agent a device watches, its owner, and its scope when it has one. */
export type WatchedAgent = { agent: string; owner: string; scope?: string };
export type PlanOf<DataModel extends GenericDataModel> = (
  ctx: GenericQueryCtx<DataModel>,
  watched: WatchedAgent,
) => Plan | Promise<Plan>;

const EVERYTHING: Plan = { devices: "included", alerts: "included" };

export function exposeWatchApi<DataModel extends GenericDataModel = GenericDataModel>(
  component: ComponentApi,
  options: { app: string; plan?: PlanOf<DataModel> },
) {
  if (!APP.test(options.app)) {
    throw new Error(`wake/v1 app names are ${APP}; "${options.app}" is not one.`);
  }
  const app = options.app;
  const watchedBy = async (ctx: GenericQueryCtx<DataModel>, key: string) => {
    // UNPAIRED first: a key that opens nothing learns nothing of a plan.
    const device = await ctx.runQuery(component.watch.device, { key });
    const watched: WatchedAgent = {
      agent: device.agent,
      owner: device.owner,
      ...(device.scope === undefined ? {} : { scope: device.scope }),
    };
    return { device, plan: options.plan ? await options.plan(ctx, watched) : EVERYTHING };
  };
  // Every watch call but `watching`, which answers on every plan.
  const inPlan = async (ctx: GenericQueryCtx<DataModel>, key: string): Promise<void> => {
    if ((await watchedBy(ctx, key)).plan.devices !== "included") {
      throw new ConvexError(NOT_IN_PLAN);
    }
  };
  return {
    runs: queryGeneric({
      args: { key: v.string() },
      handler: async (ctx, args) => {
        await inPlan(ctx, args.key);
        return await ctx.runQuery(component.watch.runs, { key: args.key, app });
      },
    }),
    answer: mutationGeneric({
      args: { key: v.string(), id: v.string(), yes: v.boolean() },
      handler: async (ctx, args) => {
        await inPlan(ctx, args.key);
        return await ctx.runMutation(component.watch.answer, args);
      },
    }),
    places: queryGeneric({
      args: { key: v.string() },
      handler: async (ctx, args) => {
        await inPlan(ctx, args.key);
        return await ctx.runQuery(component.watch.places, args);
      },
    }),
    watching: queryGeneric({
      args: { key: v.string() },
      handler: async (ctx, args) => {
        const { device, plan } = await watchedBy(ctx, args.key);
        return {
          app,
          agent: {
            id: device.agent,
            name: device.agentName,
            ...(device.tool === undefined ? {} : { tool: device.tool }),
          },
          devices: plan.devices,
          alerts: plan.alerts,
        };
      },
    }),
    push: mutationGeneric({
      args: { key: v.string(), ...pushArgs },
      handler: async (ctx, args) => {
        await inPlan(ctx, args.key);
        return await ctx.runMutation(component.watch.push, args);
      },
    }),
    activity: mutationGeneric({
      args: { key: v.string(), id: v.string(), pushToken: v.string() },
      handler: async (ctx, args) => {
        await inPlan(ctx, args.key);
        return await ctx.runMutation(component.watch.activity, args);
      },
    }),
  };
}
