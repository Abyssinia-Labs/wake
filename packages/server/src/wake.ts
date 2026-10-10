// The server half of wake/v1 for any TypeScript app (the spec, and the
// Convex component's rules, as `@abyssinia-labs/wake-convex` keeps them):
// the host decides what summons an agent and writes the prompt; this keeps
// pairing, places, the summons's life and the four calls Wake makes. It
// has no notion of who is signed in: the host checks who may, first.
import { type Changes, localChanges } from "./changes";
import { WakeError } from "./errors";
import { CODE_TTL_MS, hashSecret, newPairCode, newPlaceKey, normalizeCode } from "./keys";
import { APP, checkSummons } from "./shape";
import type { PlaceRow, State, SummonsRow, Target, Tool, WakeStore } from "./store";
import {
  type PendingSummons,
  type PlaceView,
  placeViewOf,
  type SummonsView,
  viewOf,
} from "./views";
import {
  type ClaimResult,
  claim,
  finish,
  pending,
  placeOf,
  type RunReport,
  started,
  type WakeContext,
  type WakeHooks,
} from "./wire";

export type WakeOptions = {
  /** The app's name in wake/v1: lower case, digits and dashes (`acme`). */
  app: string;
  store: WakeStore;
  /** The prefix of the keys it makes, so a leaked key says whose it is. */
  keyPrefix?: string;
  changes?: Changes;
  now?: () => number;
  /** Told when a run starts and when it ends, after the change is kept. */
  hooks?: WakeHooks;
};

export type Paired = {
  placeKey: string;
  app: string;
  agent: { id: string; name: string; tool?: Tool };
};

const LIVE: readonly State[] = ["asking", "open", "claimed"];
const WAITING: readonly State[] = ["asking", "open"];
const SCOPE_BATCH = 200;

export class Wake {
  readonly app: string;
  readonly changes: Changes;
  private readonly store: WakeStore;
  private readonly keyPrefix: string;
  private readonly now: () => number;
  private readonly hooks: WakeHooks | undefined;

  private get context(): WakeContext {
    return {
      app: this.app,
      store: this.store,
      changes: this.changes,
      now: this.now,
      ...(this.hooks ? { hooks: this.hooks } : {}),
    };
  }

  constructor(o: WakeOptions) {
    if (!APP.test(o.app)) throw new Error(`wake/v1 app names are ${APP}; "${o.app}" is not one.`);
    this.app = o.app;
    this.store = o.store;
    this.keyPrefix = o.keyPrefix ?? "wk_";
    this.changes = o.changes ?? localChanges();
    this.now = o.now ?? Date.now;
    this.hooks = o.hooks;
  }

  // Pairing (the spec's "Pairing").

  /** A pair code for the calling agent, to answer its "pair Wake" request. */
  async issueCode(o: {
    agent: string;
    agentName: string;
    owner: string;
    scope?: string;
    tool?: Tool;
  }): Promise<{ code: string; expiresAt: number }> {
    const code = newPairCode();
    const expiresAt = this.now() + CODE_TTL_MS;
    await this.store.insertCode({
      id: crypto.randomUUID(),
      ...o,
      codeHash: await hashSecret(normalizeCode(code)),
      expiresAt,
    });
    return { code, expiresAt };
  }

  /** `POST /wake/v1/pair`: one use of a live code makes the place, and its key, once. */
  async pair(o: { code: string; machine: { name: string; platform: string } }): Promise<Paired> {
    const code = await this.store.useCode(await hashSecret(normalizeCode(o.code)), this.now());
    if (!code) throw new WakeError("CODE_INVALID");
    const placeKey = newPlaceKey(this.keyPrefix);
    await this.store.insertPlace({
      id: crypto.randomUUID(),
      agent: code.agent,
      owner: code.owner,
      ...(code.scope === undefined ? {} : { scope: code.scope }),
      ...(code.tool === undefined ? {} : { tool: code.tool }),
      machine: o.machine.name,
      platform: o.machine.platform,
      keyHash: await hashSecret(placeKey),
      pairedAt: this.now(),
    });
    return {
      placeKey,
      app: this.app,
      agent: { id: code.agent, name: code.agentName, ...(code.tool ? { tool: code.tool } : {}) },
    };
  }

  /** `POST /wake/v1/forget`: the key stops working. False when it already had. */
  async forget(key: string): Promise<boolean> {
    const place = await this.store.placeByKeyHash(await hashSecret(key));
    if (!place || place.forgottenAt !== undefined) return false;
    await this.store.patchPlace(place.id, { forgottenAt: this.now() });
    return true;
  }

  // The summons's life (the spec's "A summons's life").

  /**
   * A person asked `agent` about `subject`. The owner asking opens it;
   * anyone else's ask waits for the owner (`answer`). A live one for the
   * same agent and subject is joined, not doubled. Only for a person's
   * action: an agent's own write never summons.
   */
  async summon(o: {
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
  }): Promise<string> {
    checkSummons(o);
    const now = this.now();
    const [live] = (await this.store.summonsesAbout(o.subject, o.agent)).filter((row) =>
      LIVE.includes(row.state),
    );
    if (live) {
      // The owner asking again is the yes a waiting one needed.
      const opens = live.state === "asking" && o.askedBy === live.owner;
      await this.store.moveSummons(live.id, [live.state], {
        updatedAt: now,
        ...(opens ? { state: "open", openedAt: now } : {}),
      });
      if (opens) this.changes.publish(live.agent);
      return live.id;
    }
    const id = crypto.randomUUID();
    const opens = o.askedBy === o.owner;
    await this.store.insertSummons({
      id,
      ...o,
      state: opens ? "open" : "asking",
      at: now,
      updatedAt: now,
      ...(opens ? { openedAt: now } : {}),
    });
    if (opens) this.changes.publish(o.agent);
    return id;
  }

  /** The owner's answer to a summons someone else made. Check it is the owner first. */
  async answer(o: { id: string; yes: boolean }): Promise<void> {
    const now = this.now();
    const row = await this.store.moveSummons(
      o.id,
      ["asking"],
      o.yes
        ? { state: "open", openedAt: now, updatedAt: now }
        : { state: "dropped", reason: "The owner said no.", updatedAt: now },
    );
    if (row && o.yes) this.changes.publish(row.agent);
  }

  /**
   * Ends what still waits about `subject`, for one agent or every agent
   * (and one kind or every kind): unassigned, closed, answered. A claimed
   * one is its run's to end. Answers how many it ended.
   */
  async settle(o: {
    subject: string;
    agent?: string;
    kind?: string;
    state: "done" | "dropped";
    reason: string;
  }): Promise<number> {
    const now = this.now();
    let ended = 0;
    for (const row of await this.store.summonsesAbout(o.subject, o.agent)) {
      if (!WAITING.includes(row.state) || (o.kind !== undefined && row.kind !== o.kind)) continue;
      const moved = await this.store.moveSummons(row.id, WAITING, {
        state: o.state,
        reason: o.reason.slice(0, 300),
        updatedAt: now,
      });
      if (moved) {
        ended += 1;
        this.changes.publish(row.agent);
      }
    }
    return ended;
  }

  /** Each agent's latest summons about `subject`, to show where it was made. */
  async forSubject(subject: string): Promise<SummonsView[]> {
    const latest = new Map<string, SummonsRow>();
    for (const row of await this.store.summonsesAbout(subject)) {
      const seen = latest.get(row.agent);
      if (!seen || row.updatedAt > seen.updatedAt) latest.set(row.agent, row);
    }
    const now = this.now();
    return [...latest.values()].map((row) => viewOf(row, now));
  }

  /** A person's runs list: their agents' summonses, newest first, without the dropped. */
  async forOwner(o: { owner: string; scope?: string; limit?: number }): Promise<SummonsView[]> {
    const limit = Math.max(1, Math.min(o.limit ?? 20, 50));
    const now = this.now();
    return (await this.store.summonsesOwnedBy(o.owner, 500))
      .filter((row) => row.state !== "dropped" && (o.scope === undefined || row.scope === o.scope))
      .slice(0, limit)
      .map((row) => viewOf(row, now));
  }

  // Places.
  async places(agent: string): Promise<PlaceView[]> {
    return (await this.store.placesOf(agent))
      .filter((place) => place.forgottenAt === undefined)
      .map(placeViewOf);
  }

  /** Forget one of an agent's machines. Check who may first. */
  async forgetPlace(o: { agent: string; place: string }): Promise<boolean> {
    const place = (await this.store.placesOf(o.agent)).find((one) => one.id === o.place);
    if (!place || place.forgottenAt !== undefined) return false;
    await this.store.patchPlace(place.id, { forgottenAt: this.now() });
    return true;
  }

  /** The host revoked an agent: its keys, codes and waiting summonses end with it. */
  async revokeAgent(agent: string): Promise<void> {
    const now = this.now();
    await this.store.retireAgent(agent, now);
    for (const state of WAITING) {
      for (const row of await this.store.summonsesOf(agent, state, 500)) {
        await this.store.moveSummons(row.id, WAITING, {
          state: "dropped",
          reason: "The agent was revoked.",
          updatedAt: now,
        });
      }
    }
    this.changes.publish(agent);
  }

  /** The host deleted a tenant: one batch of what is kept for `scope`. Call until `done`. */
  async deleteScope(scope: string): Promise<{ deleted: number; done: boolean }> {
    const deleted = await this.store.deleteScope(scope, SCOPE_BATCH);
    return { deleted, done: deleted < SCOPE_BATCH };
  }

  // The four calls Wake makes (the spec's "The functions" and "The HTTP
  // transport"), in wire.ts.

  /** The place a key opens, or UNPAIRED. */
  placeOf(key: string): Promise<PlaceRow> {
    return placeOf(this.context, key);
  }
  pending(key: string): Promise<PendingSummons[]> {
    return pending(this.context, key);
  }
  claim(key: string, id: string): Promise<ClaimResult> {
    return claim(this.context, key, id);
  }
  started(key: string, id: string, run: RunReport): Promise<void> {
    return started(this.context, key, id, run);
  }
  finish(key: string, id: string, outcome: "done" | "failed", reason?: string): Promise<void> {
    return finish(this.context, key, id, outcome, reason);
  }
}
