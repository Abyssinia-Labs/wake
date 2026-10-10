import { expect, test } from "bun:test";
import type { PairedApp } from "./config";
import type { Summons } from "./contract";
import { connectHttpPlace, type HttpPlaceDeps } from "./http-place";
import type { LivePlace, PlaceEvents } from "./place";

const app: PairedApp = {
  domain: "acme.dev",
  app: "acme",
  agent: { id: "a1", name: "Claude" },
  transport: "http",
  httpBase: "https://api.acme.dev/",
  pairedAt: 1,
};
const summons: Summons = {
  id: "s1",
  app: "acme",
  kind: "assigned",
  target: { kind: "ticket", ref: "ACME-1", url: "https://acme.dev/t/ACME-1" },
  at: 1,
};

type Call = {
  url: string;
  method: string;
  auth: string | null;
  accept: string | null;
  body?: unknown;
};

function server(answer: (call: Call) => Response): { calls: Call[]; deps: HttpPlaceDeps } {
  const calls: Call[] = [];
  const fake = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      auth: headers.get("authorization"),
      accept: headers.get("accept"),
      ...(typeof init?.body === "string" ? { body: JSON.parse(init.body) } : {}),
    };
    calls.push(call);
    return answer(call);
  };
  return {
    calls,
    deps: { fetch: fake as typeof fetch, sleep: () => new Promise((r) => setTimeout(r, 1)) },
  };
}

const stream = (text: string): Response =>
  new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );

function listen(deps: HttpPlaceDeps, extra: Partial<PlaceEvents> = {}) {
  const lists: Summons[][] = [];
  const unpaired: string[] = [];
  let live: LivePlace | undefined;
  const done = new Promise<void>((resolve) => {
    live = connectHttpPlace(
      app,
      "ak_secret",
      {
        onList: (_, s) => {
          lists.push(s);
          resolve();
        },
        onUnpaired: (d) => {
          unpaired.push(d);
          resolve();
        },
        note: () => undefined,
        ...extra,
      },
      "acme.dev/claude",
      deps,
    );
  });
  return { lists, unpaired, done, close: () => live?.close(), place: () => live?.place };
}

test("the pending stream lists summonses, with the key as a bearer token", async () => {
  const { calls, deps } = server(() =>
    stream(`: ping\n\nevent: pending\ndata: ${JSON.stringify([summons])}\n\n`),
  );
  const run = listen(deps);
  await run.done;
  await run.close();
  expect(run.lists[0]).toEqual([summons]);
  expect(calls[0]).toMatchObject({
    url: "https://api.acme.dev/wake/v1/pending",
    auth: "Bearer ak_secret",
    accept: "text/event-stream",
  });
});

test("claim, started and finish are POSTs; started may be missing", async () => {
  const { calls, deps } = server((call) => {
    if (call.url.endsWith("/claim")) {
      return Response.json({ claimed: true, run: { prompt: "Read ACME-1." } });
    }
    if (call.url.endsWith("/started")) return new Response(null, { status: 404 });
    if (call.url.endsWith("/finish")) return new Response(null, { status: 204 });
    return stream(`event: pending\ndata: []\n\n`);
  });
  const run = listen(deps);
  await run.done;
  const place = run.place();
  expect(await place?.claim("s1")).toEqual({ claimed: true, run: { prompt: "Read ACME-1." } });
  expect(await place?.started("s1", { name: "amber-heron", tool: "claude" })).toBe(false);
  await place?.finish({ id: "s1", outcome: "done" });
  await run.close();
  const posts = calls.filter((c) => c.method === "POST");
  expect(posts.map((c) => [c.url.split("/").pop(), c.body])).toEqual([
    ["claim", { id: "s1" }],
    ["started", { id: "s1", run: { name: "amber-heron", tool: "claude" } }],
    ["finish", { id: "s1", outcome: "done" }],
  ]);
});

test("a key that opens nothing unpairs the place once, and listening stops", async () => {
  const { calls, deps } = server(() => Response.json({ error: "unpaired" }, { status: 401 }));
  const run = listen(deps);
  await run.done;
  await new Promise((r) => setTimeout(r, 20));
  expect(run.unpaired).toEqual(["acme.dev/claude"]);
  expect(calls).toHaveLength(1);
  expect(await run.place()?.claim("s1")).toEqual({ claimed: false });
});

test("a list answered instead of a stream is still used", async () => {
  const { deps } = server(() => Response.json([summons]));
  const run = listen(deps);
  await run.done;
  await run.close();
  expect(run.lists[0]).toEqual([summons]);
});
