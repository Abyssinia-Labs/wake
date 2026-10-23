// `wake check` against an app on the HTTP transport (the spec's "The HTTP
// transport"): each route refuses a key that opens nothing with 401
// unpaired, and `started` and `waiting`, being optional, may answer 404.
import { expectRefused, type Probe } from "./check-probe";

const BODY = { "content-type": "application/json" };

export async function httpProbes(
  httpBase: string,
  nobody: string,
  fetcher: typeof fetch,
): Promise<Probe[]> {
  const base = `${httpBase.replace(/\/+$/, "")}/wake/v1`;
  const auth = { authorization: `Bearer ${nobody}` };
  const route = (path: string, init: RequestInit) => () =>
    fetcher(`${base}/${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  const post = (path: string, body: unknown) =>
    route(path, { method: "POST", headers: { ...auth, ...BODY }, body: JSON.stringify(body) });
  return [
    await expectRefused(
      "pending (JSON) refuses a key that opens nothing: 401 unpaired",
      route("pending", { headers: { ...auth, accept: "application/json" } }),
    ),
    await expectRefused(
      "pending (event stream) refuses it too",
      route("pending", { headers: { ...auth, accept: "text/event-stream" } }),
    ),
    await expectRefused("claim refuses it: 401 unpaired", post("claim", { id: "x" })),
    await expectRefused(
      "finish refuses it: 401 unpaired",
      post("finish", { id: "x", outcome: "failed" }),
    ),
    await expectRefused(
      "started (optional) refuses it: 401 unpaired",
      post("started", { id: "x", run: { name: "amber-heron", tool: "claude" } }),
      "agents comment that they started instead",
    ),
    await expectRefused(
      "waiting (optional) refuses it: 401 unpaired",
      post("waiting", { id: "x", waiting: true }),
      "Wake does without it",
    ),
  ];
}
