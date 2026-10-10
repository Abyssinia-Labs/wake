// The bridge as one Fetch handler (WAK-4), so it runs on Workers, Bun or
// Node alike: wake/v1 over HTTP for Wake, GitHub's webhook, and the pages
// to install the app and pair. Storage is any Drizzle Postgres database.
import { discovery, pairCommand, type Tool, Wake, wakeHandler } from "@abyssinia-labs/wake-server";
import { drizzleStore } from "@abyssinia-labs/wake-server/drizzle";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { agentId, ownerId, TOOL_NAMES, TOOLS } from "./commands";
import { asksIn } from "./db";
import { gitHub } from "./github";
import { githubHooks } from "./hooks";
import { signIn, signInCallback } from "./oauth";
import { home, notFound, pairPage } from "./pages";
import { type Obj, obj } from "./payload";
import { sessionOf, signedOut } from "./session";
import { signedByGitHub } from "./signature";
import { handleEvent } from "./webhook";

export type BridgeConfig = {
  /** Where the bridge is served, `https://github.wakectl.dev`. */
  origin: string;
  appId: string;
  appSlug: string;
  privateKey: string;
  webhookSecret: string;
  clientId: string;
  clientSecret: string;
  sessionSecret: string;
  /** For hosts with a request time limit: end each pending stream sooner. */
  maxStreamMs?: number;
};

export function createBridge<H extends PgQueryResultHKT, S extends Record<string, unknown>>(
  db: PgDatabase<H, S>,
  config: BridgeConfig,
  fetcher: typeof fetch = fetch,
): (req: Request) => Promise<Response> {
  const github = gitHub({ appId: config.appId, privateKey: config.privateKey }, fetcher);
  const asks = asksIn(db);
  const wake = new Wake({
    app: "github",
    store: drizzleStore(db),
    keyPrefix: "ghw_",
    hooks: githubHooks(asks, github),
  });
  const routes = wakeHandler(wake, config.maxStreamMs ? { maxStreamMs: config.maxStreamMs } : {});
  const host = new URL(config.origin).host;

  return async (req) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) return (await routes(req)) ?? notFound();
    if (url.pathname === "/.well-known/wake") {
      return Response.json(discovery({ httpBase: `${config.origin}/api` }));
    }
    if (req.method === "POST" && url.pathname === "/github/webhook") {
      const body = await req.text();
      if (
        !(await signedByGitHub(config.webhookSecret, body, req.headers.get("x-hub-signature-256")))
      ) {
        return new Response("Bad signature", { status: 401 });
      }
      const payload: unknown = JSON.parse(body);
      const handled = await handleEvent(
        { wake, asks, github, origin: config.origin },
        req.headers.get("x-github-event") ?? "",
        obj(payload) ?? ({} as Obj),
      );
      return Response.json(handled, { status: 202 });
    }
    if (url.pathname === "/auth/login") return await signIn(config);
    if (url.pathname === "/auth/callback") return await signInCallback(config, req, fetcher);
    if (req.method === "POST" && url.pathname === "/auth/logout") {
      return new Response(null, {
        status: 303,
        headers: { location: "/", "set-cookie": signedOut },
      });
    }
    const who = await sessionOf(config.sessionSecret, req);
    if (url.pathname === "/pair") {
      if (!who) return Response.redirect(`${config.origin}/auth/login`, 303);
      let code: { tool: Tool; command: string } | undefined;
      if (req.method === "POST") {
        // A form from this site only: the session cookie is Lax, and this checks the rest.
        if (req.headers.get("origin") !== config.origin)
          return new Response("Forbidden", { status: 403 });
        const form = await req.formData();
        const tool = TOOLS.find((one) => one === form.get("tool"));
        if (!tool) return new Response("Which tool?", { status: 400 });
        const issued = await wake.issueCode({
          agent: agentId(who.id, tool),
          agentName: TOOL_NAMES[tool],
          owner: ownerId(who.id),
          tool,
        });
        code = { tool, command: pairCommand(host, issued.code) };
      }
      const places = Object.fromEntries(
        await Promise.all(
          TOOLS.map(async (tool) => [tool, await wake.places(agentId(who.id, tool))]),
        ),
      ) as Record<Tool, Awaited<ReturnType<typeof wake.places>>>;
      return pairPage({ login: who.login, places, ...(code ? { code } : {}) });
    }
    if (url.pathname === "/") {
      return home({
        installUrl: `https://github.com/apps/${config.appSlug}/installations/new`,
        signedIn: who !== null,
      });
    }
    return notFound();
  };
}
