// `POST /wake/v1/pair`, `POST /wake/v1/watch` and `POST /wake/v1/forget`
// (the spec's "Pairing" and "Devices that watch"), mounted in the host's
// `convex/http.ts`. They run in the host, as HTTP actions must, so place
// and watch keys are made with real randomness here and only their hashes
// reach the component.
import {
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
  httpActionGeneric,
} from "convex/server";
import { ConvexError } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import { hashSecret, newPlaceKey, normalizeCode } from "../component/keys.js";
import { APP, cleanName, isDevice } from "../component/shape.js";

type Ctx = Pick<GenericActionCtx<GenericDataModel>, "runMutation">;

// The watch routes read no cookies, so a device in a browser may call them
// from anywhere (the spec's "The watch calls"); `forget` is one of them.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function withCors(res: Response): Response {
  for (const [name, value] of Object.entries(CORS)) res.headers.set(name, value);
  return res;
}

function refuse(status: number, error: string, message: string): Response {
  return json(status, { error, message });
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() !== "" && value.length <= max
    ? value.trim()
    : null;
}

export async function handlePair(
  ctx: Ctx,
  req: Request,
  component: ComponentApi,
  o: { app: string; keyPrefix?: string },
): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Not JSON: refused below like any other wrong body.
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const machine =
    typeof record.machine === "object" && record.machine !== null
      ? (record.machine as Record<string, unknown>)
      : {};
  const code = text(record.code, 20);
  const name = text(machine.name, 100);
  const platform = text(machine.platform, 40);
  if (!code || !name || !platform) {
    return refuse(400, "invalid_body", "Send { code, machine: { name, platform } }.");
  }
  const placeKey = newPlaceKey(o.keyPrefix);
  try {
    const paired = await ctx.runMutation(component.places.pair, {
      codeHash: await hashSecret(normalizeCode(code)),
      keyHash: await hashSecret(placeKey),
      // Wake sends the machine's own name; the owner's devices show it.
      machine: cleanName(name),
      platform,
    });
    return json(200, {
      placeKey,
      app: o.app,
      agent: {
        id: paired.agent,
        name: paired.agentName,
        ...(paired.tool === undefined ? {} : { tool: paired.tool }),
      },
    });
  } catch (error) {
    if (error instanceof ConvexError && error.data === "CODE_INVALID") {
      return refuse(
        400,
        "code_invalid",
        "That code is wrong, used or older than ten minutes. Ask your agent for a new one.",
      );
    }
    throw error;
  }
}

/** `POST /wake/v1/watch`: `{ code, device: { name, platform } }` → the watch key, once. */
export async function handleWatch(
  ctx: Ctx,
  req: Request,
  component: ComponentApi,
  o: { app: string; keyPrefix?: string },
): Promise<Response> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // Not JSON: refused below like any other wrong body.
  }
  const record = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const device =
    typeof record.device === "object" && record.device !== null
      ? (record.device as Record<string, unknown>)
      : {};
  const code = text(record.code, 20);
  const { name, platform } = device;
  if (
    !code ||
    typeof name !== "string" ||
    (platform !== "ios" && platform !== "darwin" && platform !== "web") ||
    !isDevice({ name, platform })
  ) {
    return refuse(400, "invalid_body", "Send { code, device: { name, platform } }.");
  }
  const watchKey = newPlaceKey(o.keyPrefix);
  try {
    const watched = await ctx.runMutation(component.devices.watch, {
      codeHash: await hashSecret(normalizeCode(code)),
      keyHash: await hashSecret(watchKey),
      name,
      platform,
    });
    return json(200, {
      watchKey,
      app: o.app,
      agent: {
        id: watched.agent,
        name: watched.agentName,
        ...(watched.tool === undefined ? {} : { tool: watched.tool }),
      },
    });
  } catch (error) {
    if (error instanceof ConvexError && error.data === "CODE_INVALID") {
      return refuse(
        400,
        "code_invalid",
        "That code is wrong, used or older than ten minutes. Make a new one in the app.",
      );
    }
    throw error;
  }
}

/** A place key or a watch key stops working; each opens only its own kind of door. */
export async function handleForget(
  ctx: Ctx,
  req: Request,
  component: ComponentApi,
): Promise<Response> {
  const key = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!key) return refuse(401, "unpaired", "Send the place or watch key as a bearer token.");
  const keyHash = await hashSecret(key);
  const found =
    (await ctx.runMutation(component.places.forget, { keyHash })) ||
    (await ctx.runMutation(component.devices.forget, { keyHash }));
  return found ? new Response(null, { status: 204 }) : refuse(401, "unpaired", "No such key.");
}

/**
 * Mounts the routes in the host's router, pair, watch and forget:
 *
 *   registerRoutes(http, components.wake, { app: "acme" });
 *
 * With `discovery`, it also serves `/.well-known/wake`, for an app whose
 * domain is its Convex site; any other app serves `discovery()` itself.
 */
export function registerRoutes(
  http: HttpRouter,
  component: ComponentApi,
  o: {
    app: string;
    keyPrefix?: string;
    pathPrefix?: string;
    discovery?: { convexUrl: string; httpBase: string };
  },
): void {
  if (!APP.test(o.app)) throw new Error(`wake/v1 app names are ${APP}; "${o.app}" is not one.`);
  const prefix = (o.pathPrefix ?? "/wake/v1").replace(/\/+$/, "");
  http.route({
    path: `${prefix}/pair`,
    method: "POST",
    handler: httpActionGeneric((ctx, req) => handlePair(ctx, req, component, o)),
  });
  http.route({
    path: `${prefix}/watch`,
    method: "POST",
    handler: httpActionGeneric(async (ctx, req) =>
      withCors(await handleWatch(ctx, req, component, o)),
    ),
  });
  http.route({
    path: `${prefix}/forget`,
    method: "POST",
    handler: httpActionGeneric(async (ctx, req) =>
      withCors(await handleForget(ctx, req, component)),
    ),
  });
  for (const path of ["watch", "forget"]) {
    http.route({
      path: `${prefix}/${path}`,
      method: "OPTIONS",
      handler: httpActionGeneric(async () => new Response(null, { status: 204, headers: CORS })),
    });
  }
  const found = o.discovery;
  if (found) {
    http.route({
      path: "/.well-known/wake",
      method: "GET",
      handler: httpActionGeneric(async () =>
        json(200, { version: "wake/v1", convexUrl: found.convexUrl, httpBase: found.httpBase }),
      ),
    });
  }
}
