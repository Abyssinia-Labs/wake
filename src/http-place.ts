// A paired app on the HTTP transport (the spec's "The HTTP transport"): the
// pending list as server-sent events, read for as long as the app keeps the
// stream open and read again when it ends; claim, started and finish as
// POSTs with the place key as a bearer token. A stream that keeps failing
// (a proxy that buffers it) falls back to asking every thirty seconds.
import type { PairedApp } from "./config";
import { asClaim, asSummonses, type Outcome, type RunReport } from "./contract";
import { messageOf } from "./log";
import type { LivePlace, PlaceEvents } from "./place";
import type { Place } from "./scheduler";
import { sseParser } from "./sse";

export type HttpPlaceDeps = {
  fetch: typeof fetch;
  /** Waits, or ends early when the place is closed. */
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
};

/** Two missed pings and a margin: a stream this quiet is dead. */
const QUIET_MS = 75_000;
const POLL_MS = 30_000;
const MAX_BACKOFF_MS = 60_000;
/** Failed streams in a row before falling back to polling, and polls before trying again. */
const FAILS_BEFORE_POLLING = 3;
const POLLS_BEFORE_RETRYING = 10;

export const realHttpDeps: HttpPlaceDeps = {
  fetch,
  sleep: (ms, signal) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      });
    }),
};

type StreamEnd = "clean" | "failed" | "unpaired";

export function connectHttpPlace(
  app: PairedApp,
  key: string,
  events: PlaceEvents,
  id: string,
  deps: HttpPlaceDeps = realHttpDeps,
): LivePlace {
  const base = `${app.httpBase.replace(/\/+$/, "")}/wake/v1`;
  const auth = { authorization: `Bearer ${key}` };
  const stop = new AbortController();
  let unpaired = false;
  let live = false;
  let retryMs = 1_000;

  const refuse = (): void => {
    if (unpaired) return;
    unpaired = true;
    events.onUnpaired(id);
    stop.abort();
  };

  const post = async (path: string, body: unknown): Promise<Response> => {
    const res = await deps.fetch(`${base}/${path}`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401) refuse();
    return res;
  };

  const place: Place = {
    domain: id,
    claim: async (summons) => {
      const res = await post("claim", { id: summons });
      // A key that stopped working loses every race from here on.
      if (res.status === 401) return { claimed: false };
      if (!res.ok) throw new Error(`${app.domain} answered ${res.status} to a claim.`);
      return asClaim(await res.json());
    },
    finish: async (outcome: Outcome) => {
      const res = await post("finish", outcome);
      if (!res.ok && res.status !== 401) {
        throw new Error(`${app.domain} answered ${res.status} to a finish.`);
      }
    },
    // Optional in wake/v1: a 404, or anything else, and the agent says it instead.
    started: async (summons: string, run: RunReport) => {
      try {
        return (await post("started", { id: summons, run })).ok;
      } catch {
        return false;
      }
    },
  };

  const list = (value: unknown): void => {
    try {
      const { summonses, rejected } = asSummonses(value);
      if (rejected > 0) {
        events.note(`${app.domain} listed ${rejected} summons Wake cannot read; update Wake?`);
      }
      events.onList(place, summonses);
    } catch (error) {
      events.note(messageOf(error));
    }
  };

  const stream = async (): Promise<StreamEnd> => {
    const reading = new AbortController();
    stop.signal.addEventListener("abort", () => reading.abort(), { once: true });
    let res: Response;
    try {
      res = await deps.fetch(`${base}/pending`, {
        headers: { ...auth, accept: "text/event-stream" },
        redirect: "error",
        signal: reading.signal,
      });
    } catch {
      return "failed";
    }
    if (res.status === 401) {
      refuse();
      return "unpaired";
    }
    if (!res.ok || !res.body) return "failed";
    if (!(res.headers.get("content-type") ?? "").includes("text/event-stream")) {
      // A list after all, not a stream: use it, and count the stream as failed.
      list(await res.json().catch(() => null));
      return "failed";
    }
    live = true;
    let heard = false;
    let last = Date.now();
    const parser = sseParser(
      (event) => {
        if (event.event !== "pending") return;
        heard = true;
        try {
          list(JSON.parse(event.data));
        } catch {
          events.note(`${app.domain} sent a pending list Wake cannot read.`);
        }
      },
      (ms) => {
        retryMs = Math.min(Math.max(ms, 500), MAX_BACKOFF_MS);
      },
    );
    const watchdog = setInterval(() => {
      if (Date.now() - last > QUIET_MS) reading.abort();
    }, 5_000);
    try {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        last = Date.now();
        parser.push(value);
      }
      return heard ? "clean" : "failed";
    } catch {
      return stop.signal.aborted ? "clean" : "failed";
    } finally {
      clearInterval(watchdog);
      live = false;
    }
  };

  const poll = async (): Promise<void> => {
    try {
      const res = await deps.fetch(`${base}/pending`, {
        headers: { ...auth, accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status === 401) return refuse();
      live = res.ok;
      if (res.ok) list(await res.json());
    } catch {
      live = false;
    }
  };

  const loop = async (): Promise<void> => {
    let fails = 0;
    let polls = 0;
    while (!stop.signal.aborted) {
      if (fails >= FAILS_BEFORE_POLLING) {
        await poll();
        await deps.sleep(POLL_MS, stop.signal);
        polls += 1;
        if (polls >= POLLS_BEFORE_RETRYING) [fails, polls] = [0, 0];
        continue;
      }
      const end = await stream();
      if (end === "unpaired") return;
      if (end === "clean") {
        fails = 0;
        await deps.sleep(retryMs, stop.signal);
      } else {
        fails += 1;
        await deps.sleep(Math.min(1_000 * 2 ** fails, MAX_BACKOFF_MS), stop.signal);
      }
    }
  };
  void loop();

  return {
    place,
    connected: () => live && !unpaired,
    close: async () => stop.abort(),
  };
}
