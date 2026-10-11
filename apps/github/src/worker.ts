// The bridge on Cloudflare Workers with D1 (WAK-17): one Worker at
// github.wakectl.dev. D1 bills by rows read, so the pending streams'
// re-reads cost next to nothing; Neon would have stayed awake for them
// (the owner's call, 2026-10-11). Secrets are the Worker's own, set with
// `wrangler secret put`; the rest are vars in wrangler.jsonc.
import { sqliteStore } from "@abyssinia-labs/wake-server/sqlite";
import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import { createBridge } from "./app";
import { asksInSqlite } from "./db-sqlite";

type Env = {
  DB: D1Database;
  ORIGIN: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_SLUG: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_PRIVATE_KEY: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_CLIENT_SECRET: string;
  SESSION_SECRET: string;
};

const SECRETS = [
  "GITHUB_PRIVATE_KEY",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_CLIENT_SECRET",
  "SESSION_SECRET",
] as const;

let bridge: ((req: Request) => Promise<Response>) | undefined;

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const missing = SECRETS.filter((name) => !env[name]);
    if (missing.length > 0) {
      return new Response(`Not set up yet: ${missing.join(", ")}.`, { status: 503 });
    }
    if (!bridge) {
      const db = drizzle(env.DB);
      bridge = createBridge(
        { store: sqliteStore(db), asks: asksInSqlite(db) },
        {
          origin: env.ORIGIN,
          appId: env.GITHUB_APP_ID,
          appSlug: env.GITHUB_APP_SLUG,
          privateKey: env.GITHUB_PRIVATE_KEY,
          webhookSecret: env.GITHUB_WEBHOOK_SECRET,
          clientId: env.GITHUB_CLIENT_ID,
          clientSecret: env.GITHUB_CLIENT_SECRET,
          sessionSecret: env.SESSION_SECRET,
          // Each stream ends after two minutes; Wake reconnects. Its re-reads are rows read on D1.
          maxStreamMs: 120_000,
        },
      );
    }
    return await bridge(req);
  },
};
