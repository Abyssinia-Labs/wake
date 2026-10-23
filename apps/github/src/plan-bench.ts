// The bridge the plan tests share (WAK-22, WAK-23), against PGlite and a
// GitHub that answers from a script: anyone can push, and ada is acme's
// admin, anyone else a member. Webhooks and sessions are signed as the
// bridge expects.
import { generateKeyPairSync } from "node:crypto";
import { drizzleStore, WAKE_TABLES_SQL } from "@abyssinia-labs/wake-server/drizzle";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { type BridgeConfig, createBridge } from "./app";
import { type Asks, asksIn, GITHUB_TABLES_SQL } from "./db";
import { GITHUB_KV_SQL, type Kv, kvInPg } from "./kv";
import { sessionCookie } from "./session";
import { signatureOf } from "./signature";

export const ORIGIN = "https://github.wakectl.dev";
const config: BridgeConfig = {
  origin: ORIGIN,
  appId: "1",
  appSlug: "wake",
  privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs1", format: "pem" })
    .toString(),
  webhookSecret: "hooks",
  marketplaceSecret: "market",
  clientId: "c",
  clientSecret: "s",
  sessionSecret: "sessions",
};

export type Bench = {
  bridge: (req: Request) => Promise<Response>;
  /** A webhook, signed with the app's secret or, for Marketplace's, `market`. */
  hook: (event: string, payload: object, secret?: string) => Promise<{ did: string }>;
  /** The cookie of a person signed in. */
  as: (who: { id: number; login: string }) => Promise<string>;
  kv: Kv;
  asks: Asks;
  /** Every call made to GitHub, in order. */
  github: { method: string; path: string; body?: unknown }[];
};

export async function bench(): Promise<Bench> {
  const client = new PGlite();
  await client.exec(WAKE_TABLES_SQL + GITHUB_TABLES_SQL + GITHUB_KV_SQL);
  const github: Bench["github"] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input));
    const call = {
      method: init?.method ?? "GET",
      path: url.pathname,
      ...(typeof init?.body === "string" ? { body: JSON.parse(init.body) } : {}),
    };
    github.push(call);
    if (url.pathname.endsWith("/access_tokens"))
      return Response.json({
        token: "t",
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      });
    if (url.pathname.endsWith("/permission")) return Response.json({ permission: "write" });
    if (url.pathname.startsWith("/orgs/acme/memberships/")) {
      const role = url.pathname.endsWith("/ada") ? "admin" : "member";
      return Response.json({ role, state: "active" });
    }
    if (call.method === "POST" && url.pathname.endsWith("/comments"))
      return Response.json({ id: 99 }, { status: 201 });
    return new Response(null, { status: 200 });
  };
  const db = drizzle(client);
  const kv = kvInPg(db);
  const asks = asksIn(db);
  const bridge = createBridge({ store: drizzleStore(db), asks, kv }, config, fake as typeof fetch);
  const hook = async (event: string, payload: object, secret = config.webhookSecret) => {
    const body = JSON.stringify(payload);
    const res = await bridge(
      new Request(`${ORIGIN}/github/webhook`, {
        method: "POST",
        headers: {
          "x-github-event": event,
          "x-hub-signature-256": await signatureOf(secret, body),
        },
        body,
      }),
    );
    return (await res.json()) as { did: string };
  };
  const as = async (who: { id: number; login: string }) =>
    (await sessionCookie(config.sessionSecret, who)).split(";")[0] ?? "";
  return { bridge, hook, as, kv, asks, github };
}
