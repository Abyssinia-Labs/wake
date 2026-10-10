// `wakectl check <domain>`: does an app answer wake/v1 as docs/spec/
// wake-v1.md says? Every probe is one an app must refuse (a code nobody
// issued, a key that opens nothing), so checking pairs nothing and changes
// nothing on the app.
import { ConvexHttpClient } from "convex/browser";
import { claimRef, type Discovery, finishRef, pendingRef, startedRef } from "../contract";
import { appOrigin, discover, HttpError, pairPlace } from "../http";
import { messageOf, say } from "../log";
import { isUnpairedError } from "../place";
import { bold, dim, mark } from "../ui";
import { httpProbes } from "./check-http";

export type Probe = { what: string; ok: boolean; detail?: string };

/** A key of the right shape that no app ever issued. */
const NOBODY = `wk_${"0".repeat(64)}`;

async function expectStatus(
  what: string,
  call: () => Promise<Response>,
  status: number,
  error?: string,
): Promise<Probe> {
  try {
    const res = await call();
    let code: unknown;
    try {
      code = ((await res.json()) as { error?: unknown }).error;
    } catch {
      // No JSON body: only the status can be checked.
    }
    const ok = res.status === status && (error === undefined || code === error);
    return {
      what,
      ok,
      ...(ok
        ? {}
        : { detail: `answered ${res.status}${typeof code === "string" ? ` ${code}` : ""}` }),
    };
  } catch (e) {
    return { what, ok: false, detail: messageOf(e) };
  }
}

async function expectUnpaired(
  what: string,
  call: () => Promise<unknown>,
  optional = false,
): Promise<Probe> {
  try {
    await call();
    return { what, ok: false, detail: "answered instead of throwing UNPAIRED" };
  } catch (error) {
    if (isUnpairedError(error)) return { what, ok: true };
    // An optional function passes either way: Wake does without it, and a
    // production deployment won't say whether it is missing or failed.
    if (optional) {
      return {
        what: what.replace(/ throws UNPAIRED$/, " isn't served"),
        ok: true,
        detail: "agents comment that they started instead",
      };
    }
    return { what, ok: false, detail: messageOf(error) };
  }
}

export async function checkApp(domain: string, fetcher: typeof fetch = fetch): Promise<Probe[]> {
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
  if (found.transport === "http") {
    probes.push(...(await httpProbes(found.httpBase, NOBODY, fetcher)));
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
      true,
    ),
  );
  return probes;
}

export async function check(domain: string): Promise<void> {
  say(`${bold("wake/v1")} at ${bold(appOrigin(domain))} ${dim("· docs/spec/wake-v1.md")}`);
  const probes = await checkApp(domain);
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
