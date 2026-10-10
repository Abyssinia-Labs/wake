// The bridge on this machine: Bun's server and PGlite, kept in ./.data so a
// restart keeps pairings. For a real host, wire `createBridge` to your
// Postgres the same way (README, "Hosting").
//
//   GITHUB_APP_ID=… GITHUB_APP_SLUG=… GITHUB_PRIVATE_KEY="$(cat key.pem)" \
//   GITHUB_WEBHOOK_SECRET=… GITHUB_CLIENT_ID=… GITHUB_CLIENT_SECRET=… \
//   SESSION_SECRET=… ORIGIN=https://<tunnel> bun run --cwd apps/github dev
import { WAKE_TABLES_SQL } from "@abyssinia-labs/wake-server/drizzle";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { createBridge } from "./app";
import { GITHUB_TABLES_SQL } from "./db";

function need(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}; apps/github/README.md says what each one is.`);
  return value;
}

const client = new PGlite("./.data");
await client.exec(WAKE_TABLES_SQL + GITHUB_TABLES_SQL);
const port = Number(process.env.PORT ?? 3220);
const bridge = createBridge(drizzle(client), {
  origin: process.env.ORIGIN ?? `http://localhost:${port}`,
  appId: need("GITHUB_APP_ID"),
  appSlug: need("GITHUB_APP_SLUG"),
  privateKey: need("GITHUB_PRIVATE_KEY"),
  webhookSecret: need("GITHUB_WEBHOOK_SECRET"),
  clientId: need("GITHUB_CLIENT_ID"),
  clientSecret: need("GITHUB_CLIENT_SECRET"),
  sessionSecret: need("SESSION_SECRET"),
});
Bun.serve({ port, idleTimeout: 0, fetch: bridge });
process.stdout.write(`Wake for GitHub on http://localhost:${port}\n`);
