// The watch calls over HTTP (the spec's "Devices that watch"): `POST
// /watch` trades a watch code for a key, and runs, answer, places,
// watching, push and activity take that key as a bearer token. Bodies are
// read here for their types; the calls judge their values, after the key
// and the plan.
import { WakeError } from "./errors";
import {
  bearer,
  bodyOf,
  invalidBody,
  json,
  noContent,
  record,
  refuse,
  text,
  unpaired,
} from "./http";
import { isDevice, PLATFORMS, type PushShape } from "./shape";
import { listStream, type StreamOptions } from "./stream";
import type { Wake } from "./wake";

export const WATCH_ROUTES: ReadonlySet<string> = new Set([
  "watch",
  "runs",
  "answer",
  "places",
  "watching",
  "push",
  "activity",
]);

const isText = (value: unknown): value is string => typeof value === "string";

/** `wake:push`'s body, as types only: `isPush` judges the values. */
function pushOf(body: Record<string, unknown>): PushShape | null {
  const { kinds, apns, liveActivity, webPush } = body;
  if (!Array.isArray(kinds) || !kinds.every(isText)) return null;
  const push: PushShape = { kinds };
  if (apns !== undefined) {
    const one = record(apns);
    if (!one || !isText(one.token) || !isText(one.environment)) return null;
    push.apns = { token: one.token, environment: one.environment };
  }
  if (liveActivity !== undefined) {
    const one = record(liveActivity);
    if (!one || !isText(one.pushToStartToken)) return null;
    push.liveActivity = { pushToStartToken: one.pushToStartToken };
  }
  if (webPush !== undefined) {
    const one = record(webPush);
    const keys = record(one?.keys);
    if (!one || !keys || !isText(one.endpoint) || !isText(keys.p256dh) || !isText(keys.auth)) {
      return null;
    }
    push.webPush = { endpoint: one.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
  }
  return push;
}

/** `POST /wake/v1/watch`: `{ code, device: { name, platform } }` → the watch key, once. */
async function watch(wake: Wake, req: Request): Promise<Response> {
  const body = await bodyOf(req);
  const device = record(body.device) ?? {};
  const code = text(body.code, 20);
  const platform = PLATFORMS.find((one) => one === device.platform);
  const name = device.name;
  if (!code || !platform || !isText(name) || !isDevice({ name, platform })) {
    return invalidBody("{ code, device: { name, platform } }");
  }
  try {
    return json(200, await wake.watch({ code, device: { name, platform } }));
  } catch (error) {
    if (error instanceof WakeError && error.code === "CODE_INVALID") {
      return refuse(
        400,
        "code_invalid",
        "That code is wrong, used or older than ten minutes. Make a new one in the app.",
      );
    }
    throw error;
  }
}

/** One of `WATCH_ROUTES`; null for a method it doesn't take. Refusals throw, for the handler. */
export async function watchRoute(
  wake: Wake,
  req: Request,
  route: string,
  o: StreamOptions,
): Promise<Response | null> {
  if (req.method === "POST" && route === "watch") return await watch(wake, req);
  const key = bearer(req);
  if (!key) return unpaired();
  const calls = wake.watchCalls;
  if (req.method === "GET") {
    if (route === "places") return json(200, await calls.places(key));
    if (route === "watching") return json(200, await calls.watching(key));
    if (route !== "runs") return null;
    if (!req.headers.get("accept")?.includes("text/event-stream")) {
      return json(200, await calls.runs(key));
    }
    // Refused before the stream opens, as `pending` is: 401 or 402, not an empty stream.
    const device = await calls.watcherOf(key);
    return listStream(
      {
        event: "runs",
        read: () => calls.runs(key),
        subscribe: (listener) => wake.changes.subscribe(device.agent, listener),
      },
      o,
    );
  }
  if (req.method !== "POST") return null;
  const body = await bodyOf(req);
  const id = text(body.id, 128);
  if (route === "answer") {
    if (!id || typeof body.yes !== "boolean") return invalidBody("{ id, yes }");
    await calls.answer(key, id, body.yes);
    return noContent();
  }
  if (route === "push") {
    const push = pushOf(body);
    if (!push) return invalidBody("{ kinds, apns?, liveActivity?, webPush? }");
    await calls.push(key, push);
    return noContent();
  }
  if (route === "activity") {
    if (!id || !isText(body.pushToken)) return invalidBody("{ id, pushToken }");
    await calls.activity(key, id, body.pushToken);
    return noContent();
  }
  return null;
}
