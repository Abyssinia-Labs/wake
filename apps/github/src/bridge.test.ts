// The bridge end to end: pairing through its page, a signed webhook that
// summons, Wake's HTTP calls, and the status comment, against PGlite and a
// GitHub that answers from a script.
import { expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { WAKE_TABLES_SQL } from "@abyssinia-labs/wake-server/drizzle";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { type BridgeConfig, createBridge } from "./app";
import { GITHUB_TABLES_SQL } from "./db";
import { sessionCookie } from "./session";
import { signatureOf } from "./signature";

const ORIGIN = "https://github.wakectl.dev";
const config: BridgeConfig = {
  origin: ORIGIN,
  appId: "1",
  appSlug: "wake",
  privateKey: generateKeyPairSync("rsa", { modulusLength: 2048 })
    .privateKey.export({ type: "pkcs1", format: "pem" })
    .toString(),
  webhookSecret: "hooks",
  clientId: "c",
  clientSecret: "s",
  sessionSecret: "sessions",
};
const ada = { id: 7, login: "ada" };
const repository = { id: 42, full_name: "acme/widgets" };

async function bench(permission = "write") {
  const client = new PGlite();
  await client.exec(WAKE_TABLES_SQL + GITHUB_TABLES_SQL);
  const github: { method: string; path: string; body?: unknown }[] = [];
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
    if (url.pathname.endsWith("/permission")) return Response.json({ permission });
    if (call.method === "POST" && url.pathname.endsWith("/comments"))
      return Response.json({ id: 99 }, { status: 201 });
    if (url.pathname.includes("/pulls/"))
      return Response.json({ head: { ref: "fix-login", repo: { full_name: "someone/fork" } } });
    return new Response(null, { status: 200 });
  };
  const bridge = createBridge(drizzle(client), config, fake as typeof fetch);
  const signed = await sessionCookie(config.sessionSecret, ada);
  const hook = async (event: string, payload: object) => {
    const body = JSON.stringify({
      installation: { id: 5 },
      repository,
      sender: { ...ada, type: "User" },
      ...payload,
    });
    const res = await bridge(
      new Request(`${ORIGIN}/github/webhook`, {
        method: "POST",
        headers: {
          "x-github-event": event,
          "x-hub-signature-256": await signatureOf(config.webhookSecret, body),
        },
        body,
      }),
    );
    return (await res.json()) as { did: string; summons?: string };
  };
  const wire = (path: string, key: string, body?: object) =>
    bridge(
      new Request(`${ORIGIN}/api/wake/v1/${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${key}`,
          ...(body ? { "content-type": "application/json" } : { accept: "application/json" }),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  return { bridge, github, signed, hook, wire };
}

async function pairClaude(b: Awaited<ReturnType<typeof bench>>): Promise<string> {
  const page = await b.bridge(
    new Request(`${ORIGIN}/pair`, {
      method: "POST",
      headers: { cookie: b.signed.split(";")[0] ?? "", origin: ORIGIN },
      body: new URLSearchParams({ tool: "claude" }),
    }),
  );
  const code = (await page.text()).match(
    /wakectl pair github\.wakectl\.dev ([A-Z0-9]{4}-[A-Z0-9]{4})/,
  )?.[1];
  const paired = await b.bridge(
    new Request(`${ORIGIN}/api/wake/v1/pair`, {
      method: "POST",
      body: JSON.stringify({ code, machine: { name: "Ada's Mac", platform: "darwin" } }),
    }),
  );
  return ((await paired.json()) as { placeKey: string }).placeKey;
}

const issue = {
  number: 12,
  title: "Login redirects to /undefined",
  html_url: "https://github.com/acme/widgets/issues/12",
};

test("the wake label summons your agent; the issue shows its run by name, then its end", async () => {
  const b = await bench();
  const key = await pairClaude(b);
  expect(
    await b.hook("issues", { action: "labeled", label: { name: "wake" }, issue }),
  ).toMatchObject({ did: "summoned" });
  const [summons] = (await (await b.wire("pending", key)).json()) as {
    id: string;
    repo: string;
    branch: string;
    target: { ref: string };
  }[];
  expect(summons).toMatchObject({
    repo: "acme/widgets",
    branch: "issue-12-login-redirects-to-undefined",
    target: { ref: "acme/widgets#12" },
  });
  const claimed = (await (await b.wire("claim", key, { id: summons?.id })).json()) as {
    run: { prompt: string };
  };
  expect(claimed.run.prompt).toContain("gh issue view 12 --repo acme/widgets --comments");
  await b.wire("started", key, {
    id: summons?.id,
    run: { name: "amber-heron", tool: "claude", session: "s" },
  });
  await b.wire("finish", key, { id: summons?.id, outcome: "done" });
  const said = b.github.filter(
    (c) => c.path.includes("/comments") || c.path.endsWith("/reactions"),
  );
  expect(said.map((c) => [c.method, c.path])).toEqual([
    ["POST", "/repos/acme/widgets/issues/12/reactions"],
    ["POST", "/repos/acme/widgets/issues/12/comments"],
    ["PATCH", "/repos/acme/widgets/issues/comments/99"],
  ]);
  expect(JSON.stringify(said[1]?.body)).toContain("is on it as `amber-heron`");
  expect(JSON.stringify(said[2]?.body)).toContain("finished `amber-heron`");
  expect(JSON.stringify(said)).not.toContain("Ada's Mac");
});

test("closing the issue lets a waiting summons go; an unsigned webhook is refused", async () => {
  const b = await bench();
  const key = await pairClaude(b);
  await b.hook("issues", { action: "labeled", label: { name: "wake" }, issue });
  expect(await b.hook("issues", { action: "closed", issue })).toEqual({ did: "settled: closed" });
  expect(await (await b.wire("pending", key)).json()).toEqual([]);
  const forged = await b.bridge(
    new Request(`${ORIGIN}/github/webhook`, {
      method: "POST",
      headers: { "x-github-event": "issues", "x-hub-signature-256": "sha256=00" },
      body: "{}",
    }),
  );
  expect(forged.status).toBe(401);
});

test("someone who can't push, hasn't paired, or asks on a fork's pull request wakes nothing", async () => {
  const reader = await bench("read");
  await pairClaude(reader);
  expect(
    await reader.hook("issues", { action: "labeled", label: { name: "wake" }, issue }),
  ).toEqual({ did: "refused: can't push" });

  const unpaired = await bench();
  const comment = { id: 3, html_url: `${issue.html_url}#issuecomment-3`, body: "/wake codex" };
  expect(await unpaired.hook("issue_comment", { action: "created", issue, comment })).toEqual({
    did: "refused: not paired",
  });
  expect(
    unpaired.github.some((c) => JSON.stringify(c.body ?? "").includes("pair Wake for codex first")),
  ).toBe(true);

  const fork = await bench();
  await pairClaude(fork);
  const onPull = { ...issue, number: 13, pull_request: {} };
  expect(
    await fork.hook("issue_comment", {
      action: "created",
      issue: onPull,
      comment: { ...comment, body: "/wake" },
    }),
  ).toEqual({ did: "refused: fork" });
});
