// wake/v1's routes for any server that speaks the Fetch API (Next.js route
// handlers, Hono, Bun, Deno, Cloudflare Workers): pair and forget, the HTTP
// transport's pending, claim, started, finish and waiting, and the watch
// routes (handler-watch.ts). Mount it under your `httpBase`; it answers
// null for a path that isn't one of its own, so it sits in front of your
// other routes.
import { WakeError } from "./errors";
import { WATCH_ROUTES, watchRoute } from "./handler-watch";
import {
  answerFor,
  bearer,
  bodyOf,
  invalidBody,
  json,
  noContent,
  refuse,
  text,
  unpaired,
} from "./http";
import type { Tool } from "./store";
import { pendingStream, type StreamOptions } from "./stream";
import type { Wake } from "./wake";

export type HandlerOptions = StreamOptions;

const TOOLS: readonly string[] = ["claude", "codex", "cursor"];

/** What the agent tells its person to run. */
export function pairCommand(domain: string, code: string): string {
  return `wakectl pair ${domain} ${code}`;
}

/** What the host shows beside a watch code, as text and as a QR code, so a device takes it untyped. */
export function watchLink(domain: string, code: string): string {
  return `wake://watch?domain=${encodeURIComponent(domain)}&code=${encodeURIComponent(code)}`;
}

// The watch routes read no cookies, so a device in a browser may call them
// from anywhere (the spec's "The watch calls"); `forget` is one of them.
const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-max-age": "86400",
};

/** The discovery document, for `GET https://<domain>/.well-known/wake`. */
export function discovery(o: { httpBase: string }): {
  version: "wake/v1";
  transport: "http";
  httpBase: string;
} {
  return { version: "wake/v1", transport: "http", httpBase: o.httpBase };
}

export function wakeHandler(
  wake: Wake,
  o: HandlerOptions = {},
): (req: Request) => Promise<Response | null> {
  return async (req) => {
    const route = new URL(req.url).pathname.match(/\/wake\/v1\/([a-z]+)\/?$/)?.[1];
    if (!route) return null;
    const watching = WATCH_ROUTES.has(route);
    // Forget closes a watch key too, so a browser may call it as it calls the watch routes.
    const cors = watching || route === "forget";
    if (cors && req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    let res: Response | null;
    try {
      res = await (watching ? watchRoute : placeRoute)(wake, req, route, o);
    } catch (error) {
      res = answerFor(error);
    }
    if (cors) for (const [name, value] of Object.entries(CORS)) res?.headers.set(name, value);
    return res;
  };
}

/** Pairing, forget, and the calls Wake makes with a place key. Refusals throw, for the handler. */
async function placeRoute(
  wake: Wake,
  req: Request,
  route: string,
  o: HandlerOptions,
): Promise<Response | null> {
  if (req.method === "POST" && route === "pair") return await pair(wake, req);
  const key = bearer(req);
  if (req.method === "POST" && route === "forget") {
    return key && (await wake.forget(key)) ? noContent() : unpaired();
  }
  if (!key) return unpaired();
  if (req.method === "GET" && route === "pending") {
    const place = await wake.placeOf(key);
    if (req.headers.get("accept")?.includes("text/event-stream")) {
      return pendingStream(wake, key, place.agent, o);
    }
    return json(200, await wake.pending(key));
  }
  if (req.method !== "POST") return null;
  const body = await bodyOf(req);
  const id = text(body.id, 128);
  if (route === "claim") {
    if (!id) return invalidBody("{ id }");
    return json(200, await wake.claim(key, id));
  }
  if (route === "started") {
    const run = typeof body.run === "object" && body.run !== null ? body.run : null;
    const report = run as { name?: unknown; tool?: unknown; session?: unknown } | null;
    const name = text(report?.name, 40);
    const tool = TOOLS.find((one) => one === report?.tool) as Tool | undefined;
    const session = report?.session === undefined ? undefined : text(report.session, 128);
    if (!id || !name || !tool || session === null) {
      return invalidBody("{ id, run: { name, tool, session? } }");
    }
    await wake.started(key, id, { name, tool, ...(session ? { session } : {}) });
    return noContent();
  }
  if (route === "finish") {
    const outcome = body.outcome === "done" || body.outcome === "failed" ? body.outcome : null;
    const reason = body.reason === undefined ? undefined : text(body.reason, 2000);
    if (!id || !outcome || reason === null) return invalidBody("{ id, outcome, reason? }");
    await wake.finish(key, id, outcome, reason);
    return noContent();
  }
  if (route === "waiting") {
    if (!id || typeof body.waiting !== "boolean") return invalidBody("{ id, waiting }");
    await wake.waiting(key, id, body.waiting);
    return noContent();
  }
  return null;
}

/** `POST /wake/v1/pair`: `{ code, machine: { name, platform } }` → the place key, once. */
async function pair(wake: Wake, req: Request): Promise<Response> {
  const body = await bodyOf(req);
  const machine =
    typeof body.machine === "object" && body.machine !== null
      ? (body.machine as Record<string, unknown>)
      : {};
  const code = text(body.code, 20);
  const name = text(machine.name, 100);
  const platform = text(machine.platform, 40);
  if (!code || !name || !platform) return invalidBody("{ code, machine: { name, platform } }");
  try {
    return json(200, await wake.pair({ code, machine: { name, platform } }));
  } catch (error) {
    if (error instanceof WakeError && error.code === "CODE_INVALID") {
      return refuse(
        400,
        "code_invalid",
        "That code is wrong, used or older than ten minutes. Ask your agent for a new one.",
      );
    }
    throw error;
  }
}
