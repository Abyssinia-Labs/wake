// The watch calls (the spec's "Devices that watch"), each with a watch key:
// wake:runs, answer, places, watching, push and activity. Each finds the
// device by its key's hash and answers for that device's agent only. A
// place key is looked for among devices and isn't there, so it opens none
// of them (principle 5). After the key, the host's plan: without devices,
// every call but `watching` is NOT_IN_PLAN.
import { WakeError } from "./errors";
import { hashSecret, KEY_SHAPE } from "./keys";
import { ALERT_KINDS, type Inclusion, isPush, isPushToken, type PushShape } from "./shape";
import type { DeviceRow, Tool } from "./store";
import { type WatchedPlace, type WatchedSummons, watchedOf, watchedPlaceOf } from "./watched";
import type { Plan, WakeContext, WatchedAgent } from "./wire";

/** Newest first, at most this many (the spec's `wake:runs`). */
const RUNS_LIMIT = 100;
const PLACES_LIMIT = 50;
/** Live Activities kept per device, newest last: one a run, and few run at once. */
const ACTIVITIES = 8;
/** A read needn't write each time: a device's last sight moves at most once a minute. */
const SEEN_EVERY_MS = 60_000;
const EVERYTHING: Plan = { devices: "included", alerts: "included" };

/** `wake:watching`'s answer: what a device watches, and what the plan includes. */
export type Watching = {
  app: string;
  agent: { id: string; name: string; tool?: Tool };
  devices: Inclusion;
  alerts: Inclusion;
};

/** What an agent's plan includes, the host's to say (`plan`); everything without it. */
export async function planOf(c: WakeContext, o: WatchedAgent): Promise<Plan> {
  if (!c.plan) return EVERYTHING;
  return await c.plan({
    agent: o.agent,
    owner: o.owner,
    ...(o.scope === undefined ? {} : { scope: o.scope }),
  });
}

/**
 * The owner's yes opens an ask, where places see it; their no drops it.
 * From the host (`Wake.answer`) or from one of the owner's devices.
 */
export async function answerAsk(c: WakeContext, id: string, yes: boolean): Promise<void> {
  const now = c.now();
  const row = await c.store.moveSummons(
    id,
    ["asking"],
    yes
      ? { state: "open", openedAt: now, updatedAt: now }
      : { state: "dropped", reason: "The owner said no.", updatedAt: now },
  );
  if (row) c.changes.publish(row.agent);
}

export class WatchCalls {
  constructor(private readonly c: WakeContext) {}

  /** The device a watch key opens, or UNPAIRED. */
  async deviceOf(key: string): Promise<DeviceRow> {
    if (!KEY_SHAPE.test(key)) throw new WakeError("UNPAIRED");
    const device = await this.c.store.deviceByKeyHash(await hashSecret(key));
    if (!device || device.forgottenAt !== undefined) throw new WakeError("UNPAIRED");
    const now = this.c.now();
    if (device.lastSeenAt === undefined || now - device.lastSeenAt >= SEEN_EVERY_MS) {
      await this.c.store.patchDevice(device.id, { lastSeenAt: now });
    }
    return device;
  }

  /** As `deviceOf`, on a plan that includes devices: every watch call but `watching`. */
  async watcherOf(key: string): Promise<DeviceRow> {
    const device = await this.deviceOf(key);
    if ((await planOf(this.c, device)).devices !== "included") throw new WakeError("NOT_IN_PLAN");
    return device;
  }

  /** wake:runs: the agent's summonses, newest first, asking ones included. No text. */
  async runs(key: string): Promise<WatchedSummons[]> {
    const device = await this.watcherOf(key);
    const [rows, places] = await Promise.all([
      this.c.store.latestOf(device.agent, RUNS_LIMIT),
      this.c.store.placesOf(device.agent),
    ]);
    const byId = new Map(places.map((place) => [place.id, place]));
    return rows.map((row) => watchedOf(row, this.c.app, byId));
  }

  /** wake:answer: the owner's yes or no, from their device, to an ask of the key's agent. */
  async answer(key: string, id: string, yes: boolean): Promise<void> {
    const device = await this.watcherOf(key);
    // Answered already, not asking, or another agent's: nothing to do.
    if ((await this.c.store.summonsById(id))?.agent !== device.agent) return;
    await answerAsk(this.c, id, yes);
  }

  /** wake:places: the agent's places that aren't forgotten, most recently paired first. */
  async places(key: string): Promise<WatchedPlace[]> {
    const device = await this.watcherOf(key);
    return (await this.c.store.placesOf(device.agent))
      .filter((place) => place.forgottenAt === undefined)
      .sort((a, b) => b.pairedAt - a.pairedAt)
      .slice(0, PLACES_LIMIT)
      .map(watchedPlaceOf);
  }

  /** wake:watching: answers on every plan, so a device can say plainly what it includes. */
  async watching(key: string): Promise<Watching> {
    const device = await this.deviceOf(key);
    const plan = await planOf(this.c, device);
    return {
      app: this.c.app,
      agent: {
        id: device.agent,
        name: device.agentName,
        ...(device.tool === undefined ? {} : { tool: device.tool }),
      },
      devices: plan.devices,
      alerts: plan.alerts,
    };
  }

  /** wake:push: where this device takes alerts, and which. A later call replaces it. */
  async push(key: string, p: PushShape): Promise<void> {
    const device = await this.watcherOf(key);
    if (!isPush(p, device.platform)) throw new WakeError("INVALID_BODY");
    const { apns, liveActivity, webPush } = p;
    await this.c.store.patchDevice(device.id, {
      push: {
        kinds: ALERT_KINDS.filter((kind) => p.kinds.includes(kind)),
        ...(apns
          ? {
              apns: {
                token: apns.token,
                environment: apns.environment === "development" ? "development" : "production",
              },
            }
          : {}),
        ...(liveActivity ? { liveActivity } : {}),
        ...(webPush ? { webPush } : {}),
      },
    });
  }

  /** wake:activity: a Live Activity's own update token, for one summons of the key's agent. */
  async activity(key: string, id: string, pushToken: string): Promise<void> {
    const device = await this.watcherOf(key);
    if (!isPushToken(pushToken)) throw new WakeError("INVALID_BODY");
    if ((await this.c.store.summonsById(id))?.agent !== device.agent) return;
    const others = (device.activities ?? []).filter((one) => one.summons !== id);
    await this.c.store.patchDevice(device.id, {
      activities: [...others, { summons: id, token: pushToken, at: this.c.now() }].slice(
        -ACTIVITIES,
      ),
    });
  }
}
