// `wakectl check` on the watch calls (the spec's "Devices that watch"). An
// app serves them only if it makes watch codes: `POST /watch` answering a
// code nobody issued with 400 code_invalid says it does, and 404 that it
// doesn't. Where it does, every watch call must refuse a key that opens
// nothing, and a place key above all (principle 5): this machine's own,
// when it is paired with the app, since a made-up key can't show that an
// app looks for a watch key among places too.
import type { ConvexHttpClient } from "convex/browser";
import type { Discovery } from "../contract";
import {
  activityRef,
  answerRef,
  placesRef,
  pushRef,
  runsRef,
  watchingRef,
} from "../contract-watch";
import { expectRefused, expectStatus, expectUnpaired, type Probe, together } from "./check-probe";

const JSON_BODY = { "content-type": "application/json" };
/** What an app that sends no alerts may leave out; its devices refresh runs themselves. */
const NO_ALERTS = "not served (it sends no alerts)";
/** Hex, as a push token is, from no device. */
const TOKEN = "0".repeat(64);

/** Each watch call with `key`, by the transport discovery names. */
async function refusals(
  found: Discovery,
  base: string,
  key: string,
  fetcher: typeof fetch,
  client: ConvexHttpClient | undefined,
): Promise<Probe[]> {
  if (found.transport === "convex" && client) {
    return [
      await expectUnpaired("wake:runs", () => client.query(runsRef, { key })),
      await expectUnpaired("wake:answer", () =>
        client.mutation(answerRef, { key, id: "x", yes: false }),
      ),
      await expectUnpaired("wake:places", () => client.query(placesRef, { key })),
      await expectUnpaired("wake:watching", () => client.query(watchingRef, { key })),
      await expectUnpaired(
        "wake:push",
        () => client.mutation(pushRef, { key, kinds: [] }),
        NO_ALERTS,
      ),
      await expectUnpaired(
        "wake:activity",
        () => client.mutation(activityRef, { key, id: "x", pushToken: TOKEN }),
        NO_ALERTS,
      ),
    ];
  }
  const auth = { authorization: `Bearer ${key}` };
  const route = (path: string, init: RequestInit) => () =>
    fetcher(`${base}/${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  const get = (path: string, accept = "application/json") =>
    route(path, { headers: { ...auth, accept } });
  const post = (path: string, body: unknown) =>
    route(path, { method: "POST", headers: { ...auth, ...JSON_BODY }, body: JSON.stringify(body) });
  return [
    await expectRefused("runs", get("runs")),
    await expectRefused("runs (event stream)", get("runs", "text/event-stream")),
    await expectRefused("answer", post("answer", { id: "x", yes: false })),
    await expectRefused("places", get("places")),
    await expectRefused("watching", get("watching")),
    await expectRefused("push", post("push", { kinds: [] }), NO_ALERTS),
    await expectRefused("activity", post("activity", { id: "x", pushToken: TOKEN }), NO_ALERTS),
  ];
}

export async function watchProbes(
  found: Discovery,
  keys: { nobody: string; place?: string },
  fetcher: typeof fetch,
  client?: ConvexHttpClient,
): Promise<Probe[]> {
  const base = `${found.httpBase.replace(/\/+$/, "")}/wake/v1`;
  const watch = (body: unknown) => () =>
    fetcher(`${base}/watch`, {
      method: "POST",
      headers: JSON_BODY,
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  const device = { name: "wakectl check", platform: "web" };
  const served = await expectStatus(
    "Watch refuses a code nobody issued: 400 code_invalid",
    watch({ code: "ZZZZ-ZZZZ", device }),
    400,
    "code_invalid",
  );
  if (served.detail?.startsWith("answered 404")) {
    return [
      { what: "Devices that watch aren't served", ok: true, detail: "its runs reach no device" },
    ];
  }
  const each = (key: string) => refusals(found, base, key, fetcher, client);
  const refused = found.transport === "convex" ? "throws UNPAIRED" : "401 unpaired";
  const probes = [
    served,
    await expectStatus(
      "Watch refuses a body of the wrong shape: 400 invalid_body",
      watch({}),
      400,
      "invalid_body",
    ),
    together(
      `Each watch call refuses a key that opens nothing: ${refused}`,
      await each(keys.nobody),
      keys.place ? undefined : "pair this machine with the app to try a place key too",
    ),
  ];
  if (keys.place) {
    probes.push(
      together(
        `Each watch call refuses this machine's place key: ${refused}`,
        await each(keys.place),
      ),
    );
  }
  return probes;
}
