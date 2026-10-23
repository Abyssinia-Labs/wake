// The server half of wake/v1 for any TypeScript app (the spec, and the
// Convex component's rules, as `@abyssinia-labs/wake-convex` keeps them):
// the host decides what summons an agent and writes the prompt; this keeps
// pairing, places, the summons's life, the calls Wake makes and the calls a
// device that watches makes (`watchCalls`). It has no notion of who is
// signed in: the host checks who may, first.
import { type Changes, localChanges } from "./changes";
import { type CodeFor, forget, issueCode, type Paired, pair, type Watched, watch } from "./pairing";
import { forOwner, forScope, forSubject } from "./reads";
import { APP, checkSummons } from "./shape";
import type { AlertKind, PlaceRow, Platform, State, Target, WakeStore } from "./store";
import { type PendingSummons, type PlaceView, placeViewOf, type SummonsView } from "./views";
import { answerAsk, WatchCalls } from "./watch";
import { type AlertTarget, alertTargetOf, type DeviceView, deviceViewOf } from "./watched";
import {
  type ClaimResult,
  claim,
  finish,
  type PlanHook,
  pending,
  placeOf,
  type RunReport,
  started,
  type WakeContext,
  type WakeHooks,
  waiting,
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
  /** What an agent's plan includes, asked at each watch call; without it, everything is. */
  plan?: PlanHook;
};

const LIVE: readonly State[] = ["asking", "open", "claimed"];
const WAITING: readonly State[] = ["asking", "open"];
const SCOPE_BATCH = 200;

export class Wake {
  readonly app: string;
  readonly changes: Changes;
  /** The calls a device that watches makes, each with its watch key. */
  readonly watchCalls: WatchCalls;
  private readonly store: WakeStore;
  private readonly keyPrefix: string;
  private readonly now: () => number;
  private readonly context: WakeContext;

  constructor(o: WakeOptions) {
    if (!APP.test(o.app)) throw new Error(`wake/v1 app names are ${APP}; "${o.app}" is not one.`);
    this.app = o.app;
    this.store = o.store;
    this.keyPrefix = o.keyPrefix ?? "wk_";
    this.changes = o.changes ?? localChanges();
    this.now = o.now ?? Date.now;
    this.context = {
      app: this.app,
      store: this.store,
      changes: this.changes,
      now: this.now,
      ...(o.hooks ? { hooks: o.hooks } : {}),
      ...(o.plan ? { plan: o.plan } : {}),
    };
    this.watchCalls = new WatchCalls(this.context);
  }

  // Pairing and watching (the spec's "Pairing" and "Devices that watch").

  /** A pair code for the calling agent, to answer its "pair Wake" request. */
  issueCode(o: CodeFor): Promise<{ code: string; expiresAt: number }> {
    return issueCode(this.context, o, "place");
  }

  /**
   * A watch code for an agent's owner, signed in to your app, to add a
   * device. Make one only in your own interface, for the owner: nothing a
   * run can reach may make one (the spec's principle 5). Show it with
   * `watchLink`. NOT_IN_PLAN where the plan has no devices.
   */
  issueWatchCode(o: CodeFor): Promise<{ code: string; expiresAt: number }> {
    return issueCode(this.context, o, "device");
  }

  /** `POST /wake/v1/pair`: one use of a live code makes the place, and its key, once. */
  pair(o: { code: string; machine: { name: string; platform: string } }): Promise<Paired> {
    return pair(this.context, this.keyPrefix, o);
  }

  /** `POST /wake/v1/watch`: one use of a live watch code makes the device, and its key, once. */
  watch(o: { code: string; device: { name: string; platform: Platform } }): Promise<Watched> {
    return watch(this.context, this.keyPrefix, o);
  }

  /** `POST /wake/v1/forget`: a place or watch key stops working. False when it already had. */
  forget(key: string): Promise<boolean> {
    return forget(this.context, key);
  }

  // The summons's life (the spec's "A summons's life").

  /**
   * A person asked `agent` about `subject`. The owner asking opens it;
   * anyone else's ask waits for the owner (`answer`), and `askerName` is
   * how the owner's devices say who asks. A live one for the same agent and
   * subject is joined, not doubled. Only for a person's action: an agent's
   * own write never summons.
   */
  async summon(o: {
    agent: string;
    owner: string;
    askedBy: string;
    askerName?: string;
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
      this.changes.publish(live.agent);
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
    // An ask too: places don't see it, but the owner's devices do.
    this.changes.publish(o.agent);
    return id;
  }

  /** The owner's answer to a summons someone else made. Check it is the owner first. */
  answer(o: { id: string; yes: boolean }): Promise<void> {
    return answerAsk(this.context, o.id, o.yes);
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
  forSubject(subject: string): Promise<SummonsView[]> {
    return forSubject(this.store, subject, this.now());
  }

  /** A person's runs list: their agents' summonses, newest first, without the dropped. */
  forOwner(o: { owner: string; scope?: string; limit?: number }): Promise<SummonsView[]> {
    return forOwner(this.store, o, this.now());
  }

  /** A tenant's summonses, every state, newest first: its audit. */
  forScope(o: { scope: string; limit?: number }): Promise<SummonsView[]> {
    return forScope(this.store, o, this.now());
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

  // Devices, for their owner in your app.
  async devices(agent: string): Promise<DeviceView[]> {
    return (await this.store.devicesOf(agent))
      .filter((device) => device.forgottenAt === undefined)
      .map(deviceViewOf);
  }

  /** The owner removed a device: its watch key opens nothing after. Check who may first. */
  async forgetDevice(o: { agent: string; device: string }): Promise<boolean> {
    const device = (await this.store.devicesOf(o.agent)).find((one) => one.id === o.device);
    if (!device || device.forgottenAt !== undefined) return false;
    await this.store.patchDevice(device.id, { forgottenAt: this.now() });
    return true;
  }

  /** The devices to alert of `kind`; send only while the plan includes alerts, and no text. */
  async alertTargets(o: {
    agent: string;
    kind: AlertKind;
    summons?: string;
  }): Promise<AlertTarget[]> {
    return (await this.store.devicesOf(o.agent))
      .filter((one) => one.forgottenAt === undefined && one.push?.kinds.includes(o.kind))
      .map((one) => alertTargetOf(one, o.summons));
  }

  /** The host revoked an agent: its keys, codes, devices and waiting summonses end with it. */
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

  // The calls Wake makes (the spec's "The functions" and "The HTTP
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
  waiting(key: string, id: string, waits: boolean): Promise<void> {
    return waiting(this.context, key, id, waits);
  }
}
