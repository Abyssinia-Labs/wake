// Codes traded for keys (the spec's "Pairing" and "Devices that watch"): a
// code made for one agent, spent once for a key kept only as its hash. A
// pair code becomes a place, which runs; a watch code becomes a device,
// which watches. Only the host makes a watch code, for the agent's owner
// signed in there: no route does (principle 5).
import { WakeError } from "./errors";
import { CODE_TTL_MS, hashSecret, newPairCode, newPlaceKey, normalizeCode } from "./keys";
import { cleanName } from "./shape";
import type { CodeRow, Platform, Tool } from "./store";
import { planOf } from "./watch";
import type { WakeContext } from "./wire";

/** Whose code: the agent, as the key's answer names it, and its owner. */
export type CodeFor = {
  agent: string;
  agentName: string;
  owner: string;
  scope?: string;
  tool?: Tool;
};
type AgentAnswer = { id: string; name: string; tool?: Tool };
export type Paired = { placeKey: string; app: string; agent: AgentAnswer };
export type Watched = { watchKey: string; app: string; agent: AgentAnswer };

/** A pair code for a place, or a watch code for a device; one use, ten minutes. */
export async function issueCode(
  c: WakeContext,
  o: CodeFor,
  kind: "place" | "device",
): Promise<{ code: string; expiresAt: number }> {
  // A code is made only where the plan includes what it opens.
  if (kind === "device" && (await planOf(c, o)).devices !== "included") {
    throw new WakeError("NOT_IN_PLAN");
  }
  const code = newPairCode();
  const expiresAt = c.now() + CODE_TTL_MS;
  const row = {
    id: crypto.randomUUID(),
    ...o,
    codeHash: await hashSecret(normalizeCode(code)),
    expiresAt,
  };
  await (kind === "place" ? c.store.insertCode(row) : c.store.insertWatchCode(row));
  return { code, expiresAt };
}

function answerOf(code: CodeRow): AgentAnswer {
  return { id: code.agent, name: code.agentName, ...(code.tool ? { tool: code.tool } : {}) };
}

/** `POST /wake/v1/pair`: one use of a live pair code makes the place, and its key, once. */
export async function pair(
  c: WakeContext,
  keyPrefix: string,
  o: { code: string; machine: { name: string; platform: string } },
): Promise<Paired> {
  const code = await c.store.useCode(await hashSecret(normalizeCode(o.code)), c.now());
  if (!code) throw new WakeError("CODE_INVALID");
  const placeKey = newPlaceKey(keyPrefix);
  await c.store.insertPlace({
    id: crypto.randomUUID(),
    agent: code.agent,
    owner: code.owner,
    ...(code.scope === undefined ? {} : { scope: code.scope }),
    ...(code.tool === undefined ? {} : { tool: code.tool }),
    // Wake sends the machine's own name; the owner's devices show it.
    machine: cleanName(o.machine.name),
    platform: o.machine.platform,
    keyHash: await hashSecret(placeKey),
    pairedAt: c.now(),
  });
  return { placeKey, app: c.app, agent: answerOf(code) };
}

/** `POST /wake/v1/watch`: one use of a live watch code makes the device, and its key, once. */
export async function watch(
  c: WakeContext,
  keyPrefix: string,
  o: { code: string; device: { name: string; platform: Platform } },
): Promise<Watched> {
  const code = await c.store.useWatchCode(await hashSecret(normalizeCode(o.code)), c.now());
  if (!code) throw new WakeError("CODE_INVALID");
  const watchKey = newPlaceKey(keyPrefix);
  await c.store.insertDevice({
    id: crypto.randomUUID(),
    agent: code.agent,
    agentName: code.agentName,
    owner: code.owner,
    ...(code.scope === undefined ? {} : { scope: code.scope }),
    ...(code.tool === undefined ? {} : { tool: code.tool }),
    name: o.device.name,
    platform: o.device.platform,
    keyHash: await hashSecret(watchKey),
    madeAt: c.now(),
  });
  return { watchKey, app: c.app, agent: answerOf(code) };
}

/** `POST /wake/v1/forget`: a place key or a watch key stops working. False when it already had. */
export async function forget(c: WakeContext, key: string): Promise<boolean> {
  const keyHash = await hashSecret(key);
  const place = await c.store.placeByKeyHash(keyHash);
  if (place) {
    if (place.forgottenAt !== undefined) return false;
    await c.store.patchPlace(place.id, { forgottenAt: c.now() });
    return true;
  }
  const device = await c.store.deviceByKeyHash(keyHash);
  if (!device || device.forgottenAt !== undefined) return false;
  await c.store.patchDevice(device.id, { forgottenAt: c.now() });
  return true;
}
