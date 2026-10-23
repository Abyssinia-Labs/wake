// `GET /wake/v1/pending` and a device's `GET /wake/v1/runs` as server-sent
// events (the spec's "The HTTP transport"): the whole list on connect and
// whenever it changes, a ping while it doesn't, ended after `maxStreamMs`
// with a `retry:` so the caller comes back. A change made in this process
// is sent at once; one made by another instance shows within `pollMs`,
// when the list is read again.
import type { Wake } from "./wake";

export type StreamOptions = {
  /** How often to read the list again for changes made elsewhere. 10 s. */
  pollMs?: number;
  /** A comment line this often while nothing changes; the spec asks for 30 s at most. 25 s. */
  pingMs?: number;
  /** End the stream after this long, for hosts with a time limit; Wake reconnects. 5 min. */
  maxStreamMs?: number;
};

const encoder = new TextEncoder();

/** A list's stream: `read` it again whenever `subscribe` hears of a change, and on a timer. */
export type ListSource = {
  event: string;
  read: () => Promise<unknown>;
  subscribe: (listener: () => void) => () => void;
};

export function pendingStream(wake: Wake, key: string, agent: string, o: StreamOptions): Response {
  return listStream(
    {
      event: "pending",
      read: () => wake.pending(key),
      subscribe: (listener) => wake.changes.subscribe(agent, listener),
    },
    o,
  );
}

export function listStream(source: ListSource, o: StreamOptions): Response {
  const pollMs = o.pollMs ?? 10_000;
  const pingMs = Math.min(o.pingMs ?? 25_000, 30_000);
  const maxStreamMs = o.maxStreamMs ?? 5 * 60_000;
  let stop = (_closeIt: boolean): void => undefined;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let last = "";
      let closed = false;
      const send = (text: string): void => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      // Wake hanging up has already closed it; only an end of ours closes it.
      const end = (closeIt = true): void => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(ping);
        clearTimeout(limit);
        unsubscribe();
        if (closeIt) controller.close();
      };
      const look = async (): Promise<void> => {
        try {
          const list = JSON.stringify(await source.read());
          if (list === last) return;
          last = list;
          send(`event: ${source.event}\ndata: ${list}\n\n`);
        } catch {
          // The key stopped working (forgotten, revoked) or the plan did:
          // end, and the reconnect is answered 401 or 402.
          end();
        }
      };
      const unsubscribe = source.subscribe(() => void look());
      const poll = setInterval(() => void look(), pollMs);
      const ping = setInterval(() => send(": ping\n\n"), pingMs);
      const limit = setTimeout(() => {
        send("retry: 1000\n\n");
        end();
      }, maxStreamMs);
      stop = end;
      void look();
    },
    cancel() {
      stop(false);
    },
  });
  return new Response(body, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      // Tells nginx and friends not to buffer it.
      "x-accel-buffering": "no",
    },
  });
}
