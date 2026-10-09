// `POST /wake/v1/pair` and `POST /wake/v1/forget` (the spec's "Pairing"),
// mounted in the host's `convex/http.ts`. They run in the host, as HTTP
// actions must, so the place key is made with real randomness here and
// only its hash reaches the component.
import {
  type GenericActionCtx,
  type GenericDataModel,
  type HttpRouter,
  httpActionGeneric,
} from "convex/server";
import { ConvexError } from "convex/values";
import type { ComponentApi } from "../component/_generated/component.js";
import { hashSecret, newPlaceKey, normalizeCode } from "../component/keys.js";
import { APP } from "../component/shape.js";

type Ctx = Pick<GenericActionCtx<GenericDataModel>, "runMutation">;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
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
      machine: name,
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

export async function handleForget(
  ctx: Ctx,
  req: Request,
  component: ComponentApi,
): Promise<Response> {
  const key = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!key) return refuse(401, "unpaired", "Send the place key as a bearer token.");
  const found = await ctx.runMutation(component.places.forget, { keyHash: await hashSecret(key) });
  return found ? new Response(null, { status: 204 }) : refuse(401, "unpaired", "No such place.");
}

/**
 * Mounts the two routes in the host's router:
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
    path: `${prefix}/forget`,
    method: "POST",
    handler: httpActionGeneric((ctx, req) => handleForget(ctx, req, component)),
  });
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
