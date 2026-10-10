// wake/v1's routes for any server that speaks the Fetch API (Next.js route
// handlers, Hono, Bun, Deno, Cloudflare Workers): pair and forget, and the
// HTTP transport's pending, claim, started and finish. Mount it under your
// `httpBase`; it answers null for a path that isn't one of its own, so it
// sits in front of your other routes.
import { WakeError } from "./errors";
import { answerFor, bearer, bodyOf, invalidBody, json, refuse, text, unpaired } from "./http";
import type { Tool } from "./store";
import { pendingStream, type StreamOptions } from "./stream";
import type { Wake } from "./wake";

export type HandlerOptions = StreamOptions;

const TOOLS: readonly string[] = ["claude", "codex", "cursor"];

/** What the agent tells its person to run. */
export function pairCommand(domain: string, code: string): string {
  return `wakectl pair ${domain} ${code}`;
}

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
    try {
      if (req.method === "POST" && route === "pair") return await pair(wake, req);
      const key = bearer(req);
      if (req.method === "POST" && route === "forget") {
        return key && (await wake.forget(key)) ? new Response(null, { status: 204 }) : unpaired();
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
        return new Response(null, { status: 204 });
      }
      if (route === "finish") {
        const outcome = body.outcome === "done" || body.outcome === "failed" ? body.outcome : null;
        const reason = body.reason === undefined ? undefined : text(body.reason, 2000);
        if (!id || !outcome || reason === null) return invalidBody("{ id, outcome, reason? }");
        await wake.finish(key, id, outcome, reason);
        return new Response(null, { status: 204 });
      }
      return null;
    } catch (error) {
      return answerFor(error);
    }
  };
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
