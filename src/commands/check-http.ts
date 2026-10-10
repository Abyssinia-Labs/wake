// `wake check` against an app on the HTTP transport (the spec's "The HTTP
// transport"): each route refuses a key that opens nothing with 401
// unpaired, and `started`, being optional, may answer 404 instead.
import { messageOf } from "../log";
import type { Probe } from "./check";

const BODY = { "content-type": "application/json" };

export async function httpProbes(
  httpBase: string,
  nobody: string,
  fetcher: typeof fetch,
): Promise<Probe[]> {
  const base = `${httpBase.replace(/\/+$/, "")}/wake/v1`;
  const auth = { authorization: `Bearer ${nobody}` };
  const refused = async (
    what: string,
    path: string,
    init: RequestInit,
    optional = false,
  ): Promise<Probe> => {
    try {
      const res = await fetcher(`${base}/${path}`, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      let code: unknown;
      try {
        code = ((await res.json()) as { error?: unknown }).error;
      } catch {
        // A stream or no body: only the status can be checked.
      }
      if (res.status === 401 && code === "unpaired") return { what, ok: true };
      if (optional && res.status === 404) {
        return {
          what: what.replace(/ refuses .*$/, " isn't served"),
          ok: true,
          detail: "agents comment that they started instead",
        };
      }
      return { what, ok: false, detail: `answered ${res.status}${code ? ` ${String(code)}` : ""}` };
    } catch (error) {
      return { what, ok: false, detail: messageOf(error) };
    }
  };
  const post = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { ...auth, ...BODY },
    body: JSON.stringify(body),
  });
  return [
    await refused("pending (JSON) refuses a key that opens nothing: 401 unpaired", "pending", {
      headers: { ...auth, accept: "application/json" },
    }),
    await refused("pending (event stream) refuses it too", "pending", {
      headers: { ...auth, accept: "text/event-stream" },
    }),
    await refused("claim refuses it: 401 unpaired", "claim", post({ id: "x" })),
    await refused(
      "finish refuses it: 401 unpaired",
      "finish",
      post({ id: "x", outcome: "failed" }),
    ),
    await refused(
      "started (optional) refuses it: 401 unpaired",
      "started",
      post({ id: "x", run: { name: "amber-heron", tool: "claude" } }),
      true,
    ),
  ];
}
