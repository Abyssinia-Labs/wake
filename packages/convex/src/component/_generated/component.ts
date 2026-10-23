/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    devices: {
      alertTargets: FunctionReference<
        "query",
        "internal",
        {
          agent: string;
          kind: "ask" | "waiting" | "started" | "done" | "failed";
          summons?: string;
        },
        Array<{
          activityToken?: string;
          apns?: { environment: "production" | "development"; token: string };
          device: string;
          liveActivity?: { pushToStartToken: string };
          platform: "ios" | "darwin" | "web";
          webPush?: {
            endpoint: string;
            keys: { auth: string; p256dh: string };
          };
        }>,
        Name
      >;
      forget: FunctionReference<
        "mutation",
        "internal",
        { keyHash: string },
        boolean,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { agent: string },
        Array<{
          alerts: Array<"ask" | "waiting" | "started" | "done" | "failed">;
          id: string;
          lastSeenAt?: number;
          madeAt: number;
          name: string;
          platform: "ios" | "darwin" | "web";
        }>,
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { agent: string; device: string },
        boolean,
        Name
      >;
      storeCode: FunctionReference<
        "mutation",
        "internal",
        {
          agent: string;
          agentName: string;
          codeHash: string;
          expiresAt: number;
          owner: string;
          scope?: string;
          tool?: "claude" | "codex" | "cursor";
        },
        null,
        Name
      >;
      watch: FunctionReference<
        "mutation",
        "internal",
        {
          codeHash: string;
          keyHash: string;
          name: string;
          platform: "ios" | "darwin" | "web";
        },
        {
          agent: string;
          agentName: string;
          tool?: "claude" | "codex" | "cursor";
        },
        Name
      >;
    };
    places: {
      forget: FunctionReference<
        "mutation",
        "internal",
        { keyHash: string },
        boolean,
        Name
      >;
      list: FunctionReference<
        "query",
        "internal",
        { agent: string },
        Array<{
          id: string;
          lastSeenAt?: number;
          machine: string;
          pairedAt: number;
          platform: string;
          tool?: "claude" | "codex" | "cursor";
        }>,
        Name
      >;
      pair: FunctionReference<
        "mutation",
        "internal",
        {
          codeHash: string;
          keyHash: string;
          machine: string;
          platform: string;
        },
        {
          agent: string;
          agentName: string;
          tool?: "claude" | "codex" | "cursor";
        },
        Name
      >;
      remove: FunctionReference<
        "mutation",
        "internal",
        { agent: string; place: string },
        boolean,
        Name
      >;
      revokeAgent: FunctionReference<
        "mutation",
        "internal",
        { agent: string },
        null,
        Name
      >;
      storeCode: FunctionReference<
        "mutation",
        "internal",
        {
          agent: string;
          agentName: string;
          codeHash: string;
          expiresAt: number;
          owner: string;
          scope?: string;
          tool?: "claude" | "codex" | "cursor";
        },
        null,
        Name
      >;
    };
    runs: {
      forOwner: FunctionReference<
        "query",
        "internal",
        { limit?: number; owner: string; scope?: string },
        Array<{
          agent: string;
          askedBy: string;
          at: number;
          id: string;
          kind: string;
          owner: string;
          reason?: string;
          run?: {
            machine: string;
            name: string;
            session?: string;
            startedAt: number;
            tool: "claude" | "codex" | "cursor";
          };
          scope?: string;
          state: "asking" | "open" | "claimed" | "done" | "failed" | "dropped";
          subject: string;
          target: { kind: string; ref: string; url: string };
          unclaimed: boolean;
          updatedAt: number;
          waiting?: boolean;
        }>,
        Name
      >;
    };
    scopes: {
      deleteScope: FunctionReference<
        "mutation",
        "internal",
        { scope: string },
        { deleted: number; done: boolean },
        Name
      >;
    };
    summonses: {
      answer: FunctionReference<
        "mutation",
        "internal",
        { id: string; yes: boolean },
        null,
        Name
      >;
      forSubject: FunctionReference<
        "query",
        "internal",
        { subject: string },
        Array<{
          agent: string;
          askedBy: string;
          at: number;
          id: string;
          kind: string;
          owner: string;
          reason?: string;
          run?: {
            machine: string;
            name: string;
            session?: string;
            startedAt: number;
            tool: "claude" | "codex" | "cursor";
          };
          scope?: string;
          state: "asking" | "open" | "claimed" | "done" | "failed" | "dropped";
          subject: string;
          target: { kind: string; ref: string; url: string };
          unclaimed: boolean;
          updatedAt: number;
          waiting?: boolean;
        }>,
        Name
      >;
      settle: FunctionReference<
        "mutation",
        "internal",
        {
          agent?: string;
          kind?: string;
          reason: string;
          state: "done" | "dropped";
          subject: string;
        },
        number,
        Name
      >;
      summon: FunctionReference<
        "mutation",
        "internal",
        {
          agent: string;
          askedBy: string;
          askerName?: string;
          branch?: string;
          kind: string;
          owner: string;
          prompt: string;
          repo?: string;
          scope?: string;
          subject: string;
          target: { kind: string; ref: string; url: string };
        },
        string,
        Name
      >;
    };
    watch: {
      activity: FunctionReference<
        "mutation",
        "internal",
        { id: string; key: string; pushToken: string },
        null,
        Name
      >;
      answer: FunctionReference<
        "mutation",
        "internal",
        { id: string; key: string; yes: boolean },
        null,
        Name
      >;
      device: FunctionReference<
        "query",
        "internal",
        { key: string },
        {
          agent: string;
          agentName: string;
          owner: string;
          scope?: string;
          tool?: "claude" | "codex" | "cursor";
        },
        Name
      >;
      places: FunctionReference<
        "query",
        "internal",
        { key: string },
        Array<{
          lastClaimAt?: number;
          name: string;
          pairedAt: number;
          platform: string;
        }>,
        Name
      >;
      push: FunctionReference<
        "mutation",
        "internal",
        {
          apns?: { environment: string; token: string };
          key: string;
          kinds: Array<string>;
          liveActivity?: { pushToStartToken: string };
          webPush?: {
            endpoint: string;
            keys: { auth: string; p256dh: string };
          };
        },
        null,
        Name
      >;
      runs: FunctionReference<
        "query",
        "internal",
        { app: string; key: string },
        Array<{
          app: string;
          asker?: { name: string };
          at: number;
          branch?: string;
          endedAt?: number;
          id: string;
          kind: string;
          place?: { name: string };
          reason?: string;
          repo?: string;
          run?: {
            name: string;
            session?: string;
            startedAt: number;
            tool: "claude" | "codex" | "cursor";
          };
          state: "asking" | "open" | "claimed" | "done" | "failed" | "dropped";
          target: { kind: string; ref: string; url: string };
          waiting?: boolean;
        }>,
        Name
      >;
    };
    wire: {
      claim: FunctionReference<
        "mutation",
        "internal",
        { id: string; key: string },
        { claimed: true; run: { prompt: string } } | { claimed: false },
        Name
      >;
      finish: FunctionReference<
        "mutation",
        "internal",
        {
          id: string;
          key: string;
          outcome: "done" | "failed";
          reason?: string;
        },
        null,
        Name
      >;
      pending: FunctionReference<
        "query",
        "internal",
        { app: string; key: string },
        Array<{
          app: string;
          at: number;
          branch?: string;
          id: string;
          kind: string;
          repo?: string;
          target: { kind: string; ref: string; url: string };
        }>,
        Name
      >;
      started: FunctionReference<
        "mutation",
        "internal",
        {
          id: string;
          key: string;
          run: {
            name: string;
            session?: string;
            tool: "claude" | "codex" | "cursor";
          };
        },
        null,
        Name
      >;
      waiting: FunctionReference<
        "mutation",
        "internal",
        { id: string; key: string; waiting: boolean },
        null,
        Name
      >;
    };
  };
