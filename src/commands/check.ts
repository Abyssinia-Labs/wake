// `wakectl check <domain>`: does an app answer wake/v1 as docs/spec/
// wake-v1.md says? Every probe is one an app must refuse (a code nobody
// issued, a key that opens nothing), so checking pairs nothing and changes
// nothing on the app. Where this machine is paired with the app, its own
// place key is tried on the watch calls too, which must refuse it.
import { ConvexHttpClient } from "convex/browser";
import { domainKey, loadConfig } from "../config";
import {
  claimRef,
  type Discovery,
  finishRef,
  pendingRef,
  startedRef,
  waitingRef,
} from "../contract";
import { appOrigin, discover, HttpError, pairPlace } from "../http";
import { messageOf, say } from "../log";
import { keychain } from "../secrets";
import { bold, dim, mark } from "../ui";
import { httpProbes } from "./check-http";
import { expectStatus, expectUnpaired, NOBODY, type Probe } from "./check-probe";
import { watchProbes } from "./check-watch";

export type { Probe };

export async function checkApp(
  domain: string,
  fetcher: typeof fetch = fetch,
  placeKey?: string,
): Promise<Probe[]> {
  const probes: Probe[] = [];
  let found: Discovery;
  try {
    found = await discover(domain, fetcher);
    probes.push({
      what: "Discovery: /.well-known/wake is wake/v1, on secure URLs, with no redirect",
      ok: true,
    });
  } catch (error) {
    probes.push({ what: "Discovery", ok: false, detail: messageOf(error) });
    return probes;
  }
  const machine = { name: "wakectl check", platform: process.platform };
  try {
    await pairPlace(found, "ZZZZ-ZZZZ", machine, fetcher);
    probes.push({ what: "Pair refuses a code nobody issued", ok: false, detail: "it paired" });
  } catch (error) {
    const ok = error instanceof HttpError && error.status === 400 && error.code === "code_invalid";
    probes.push({
      what: "Pair refuses a code nobody issued: 400 code_invalid",
      ok,
      ...(ok ? {} : { detail: messageOf(error) }),
    });
  }
  const route = (path: string, init: RequestInit) => () =>
    fetcher(`${found.httpBase}${path}`, { ...init, redirect: "error" });
  probes.push(
    await expectStatus(
      "Pair refuses a body of the wrong shape: 400 invalid_body",
      route("/wake/v1/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
      400,
      "invalid_body",
    ),
    await expectStatus(
      "Forget refuses a key that opens nothing: 401",
      route("/wake/v1/forget", { method: "POST", headers: { authorization: `Bearer ${NOBODY}` } }),
      401,
    ),
  );
  const keys = { nobody: NOBODY, ...(placeKey ? { place: placeKey } : {}) };
  if (found.transport === "http") {
    probes.push(...(await httpProbes(found.httpBase, NOBODY, fetcher)));
    probes.push(...(await watchProbes(found, keys, fetcher)));
    return probes;
  }
  const client = new ConvexHttpClient(found.convexUrl);
  probes.push(
    await expectUnpaired("wake:pending throws UNPAIRED for a key that opens nothing", () =>
      client.query(pendingRef, { key: NOBODY }),
    ),
    await expectUnpaired("wake:claim throws UNPAIRED", () =>
      client.mutation(claimRef, { key: NOBODY, id: "x" }),
    ),
    await expectUnpaired("wake:finish throws UNPAIRED", () =>
      client.mutation(finishRef, { key: NOBODY, id: "x", outcome: "failed" }),
    ),
    await expectUnpaired(
      "wake:started (optional) throws UNPAIRED",
      () =>
        client.mutation(startedRef, {
          key: NOBODY,
          id: "x",
          run: { name: "amber-heron", tool: "claude" },
        }),
      "agents comment that they started instead",
    ),
    await expectUnpaired(
      "wake:waiting (optional) throws UNPAIRED",
      () => client.mutation(waitingRef, { key: NOBODY, id: "x", waiting: true }),
      "Wake does without it",
    ),
  );
  probes.push(...(await watchProbes(found, keys, fetcher, client)));
  return probes;
}

/** This machine's place key for `domain`, when it is paired with it; it opens no watch call. */
async function placeKeyFor(domain: string): Promise<string | undefined> {
  try {
    const host = domainKey(domain);
    const paired = Object.entries((await loadConfig()).apps).find(([, app]) => app.domain === host);
    return paired ? ((await keychain.get(paired[0])) ?? undefined) : undefined;
  } catch {
    // No config or no secret store: the made-up key is tried alone.
    return undefined;
  }
}

export async function check(domain: string): Promise<void> {
  say(`${bold("wake/v1")} at ${bold(appOrigin(domain))} ${dim("· docs/spec/wake-v1.md")}`);
  const probes = await checkApp(domain, fetch, await placeKeyFor(domain));
  for (const probe of probes) {
    say(
      `  ${probe.ok ? mark.ok() : mark.fail()} ${probe.what}${probe.detail ? dim(`  ${probe.detail}`) : ""}`,
    );
  }
  const failed = probes.filter((probe) => !probe.ok).length;
  say(
    failed === 0
      ? `\n${mark.ok()} Wake can pair with it.`
      : `\n${mark.fail()} ${failed} of ${probes.length} failed.`,
  );
  if (failed > 0) process.exitCode = 1;
}
