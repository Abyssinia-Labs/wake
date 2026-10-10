// What a host app imports: `Wake`, to make and settle summonses and manage
// places from its own functions; `exposeApi`, which gives wake:pending,
// wake:claim and wake:finish their public names; and `registerRoutes`,
// which mounts the pair and forget routes. docs/spec/wake-v1.md is the
// protocol these serve.
import {
  type GenericActionCtx,
  type GenericDataModel,
  type GenericMutationCtx,
  type GenericQueryCtx,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import { CODE_TTL_MS, hashSecret, newPairCode, normalizeCode } from "../component/keys.js";
import { APP } from "../component/shape.js";

export { registerRoutes } from "./routes.js";
export type { ComponentApi };

type RunQuery = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
type RunMutation = Pick<GenericMutationCtx<GenericDataModel>, "runQuery" | "runMutation">;
type RunAction = Pick<GenericActionCtx<GenericDataModel>, "runQuery" | "runMutation">;

export type Tool = "claude" | "codex" | "cursor";
export type Target = { kind: string; ref: string; url: string };

export type WakeOptions = {
  /** The app's name in wake/v1: lower case, digits and dashes (`gatherd`). */
  app: string;
};

function checkApp(app: string): string {
  if (!APP.test(app)) throw new Error(`wake/v1 app names are ${APP}; "${app}" is not one.`);
  return app;
}

/** The discovery document, for `GET https://<domain>/.well-known/wake`. */
export function discovery(o: { convexUrl: string; httpBase: string }): {
  version: "wake/v1";
  convexUrl: string;
  httpBase: string;
} {
  return { version: "wake/v1", convexUrl: o.convexUrl, httpBase: o.httpBase };
}

/** What the agent tells its person to run. */
export function pairCommand(domain: string, code: string): string {
  return `wakectl pair ${domain} ${code}`;
}

export class Wake {
  readonly app: string;
  constructor(
    readonly component: ComponentApi,
    options: WakeOptions,
  ) {
    this.app = checkApp(options.app);
  }

  /**
   * A pair code for the calling agent, to answer its "pair Wake" request.
   * Needs real randomness, so call it from an action or an HTTP action.
   */
  async issueCode(
    ctx: RunAction,
    o: { agent: string; agentName: string; owner: string; scope?: string; tool?: Tool },
  ): Promise<{ code: string; expiresAt: number }> {
    const code = newPairCode();
    const expiresAt = Date.now() + CODE_TTL_MS;
    await ctx.runMutation(this.component.places.storeCode, {
      ...o,
      codeHash: await hashSecret(normalizeCode(code)),
      expiresAt,
    });
    return { code, expiresAt };
  }

  /** A person asked an agent about a subject: see the component's `summon`. */
  async summon(
    ctx: RunMutation,
    o: {
      agent: string;
      owner: string;
      askedBy: string;
      scope?: string;
      subject: string;
      kind: string;
      target: Target;
      repo?: string;
      branch?: string;
      prompt: string;
    },
  ): Promise<string> {
    return await ctx.runMutation(this.component.summonses.summon, o);
  }

  /** The owner's yes or no to a summons someone else made. Check it is the owner first. */
  async answer(ctx: RunMutation, o: { id: string; yes: boolean }): Promise<void> {
    await ctx.runMutation(this.component.summonses.answer, o);
  }

  /** End what still waits about a subject: unassigned, closed, answered. */
  async settle(
    ctx: RunMutation,
    o: {
      subject: string;
      agent?: string;
      kind?: string;
      state: "done" | "dropped";
      reason: string;
    },
  ): Promise<number> {
    return await ctx.runMutation(this.component.summonses.settle, o);
  }

  /** Each agent's latest summons about a subject, to show where it was made. */
  async forSubject(ctx: RunQuery, subject: string) {
    return await ctx.runQuery(this.component.summonses.forSubject, { subject });
  }

  /**
   * What a person's agents were asked and did, newest first, without the
   * dropped: for a runs list outside the comments. Check the caller is
   * `owner` first; `session` in each `run` is theirs alone.
   */
  async forOwner(ctx: RunQuery, o: { owner: string; scope?: string; limit?: number }) {
    return await ctx.runQuery(this.component.runs.forOwner, o);
  }

  /** An agent's paired machines. */
  async places(ctx: RunQuery, agent: string) {
    return await ctx.runQuery(this.component.places.list, { agent });
  }

  /** Forget one of an agent's machines. Check who may first. */
  async forgetPlace(ctx: RunMutation, o: { agent: string; place: string }): Promise<boolean> {
    return await ctx.runMutation(this.component.places.remove, o);
  }

  /**
   * The host deleted a tenant: one batch of what the component keeps for
   * `scope`. Call it again until `done`, from the host's deletion steps.
   */
  async deleteScope(ctx: RunMutation, scope: string): Promise<{ deleted: number; done: boolean }> {
    return await ctx.runMutation(this.component.scopes.deleteScope, { scope });
  }

  /** The host revoked an agent: its keys, codes and waiting summonses end with it. */
  async revokeAgent(ctx: RunMutation, agent: string): Promise<void> {
    await ctx.runMutation(this.component.places.revokeAgent, { agent });
  }
}

/**
 * wake:pending, wake:claim, wake:started and wake:finish, for the host's
 * `convex/wake.ts`:
 *
 *   export const { pending, claim, started, finish } = exposeApi(components.wake, { app: "acme" });
 *
 * They take no auth: the place key is the credential (the spec), and the
 * component checks it.
 */
export function exposeApi(component: ComponentApi, options: WakeOptions) {
  const app = checkApp(options.app);
  return {
    pending: queryGeneric({
      args: { key: v.string() },
      handler: async (ctx, args) =>
        await ctx.runQuery(component.wire.pending, { key: args.key, app }),
    }),
    claim: mutationGeneric({
      args: { key: v.string(), id: v.string() },
      handler: async (ctx, args) => await ctx.runMutation(component.wire.claim, args),
    }),
    started: mutationGeneric({
      args: {
        key: v.string(),
        id: v.string(),
        run: v.object({
          name: v.string(),
          tool: v.union(v.literal("claude"), v.literal("codex"), v.literal("cursor")),
          session: v.optional(v.string()),
        }),
      },
      handler: async (ctx, args) => await ctx.runMutation(component.wire.started, args),
    }),
    finish: mutationGeneric({
      args: {
        key: v.string(),
        id: v.string(),
        outcome: v.union(v.literal("done"), v.literal("failed")),
        reason: v.optional(v.string()),
      },
      handler: async (ctx, args) => await ctx.runMutation(component.wire.finish, args),
    }),
  };
}
