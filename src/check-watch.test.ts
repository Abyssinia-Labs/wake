import { describe, expect, test } from "bun:test";
import { checkApp } from "./commands/check";

const PLACE_KEY = `wk_${"1".repeat(64)}`;
const WATCH_ROUTES = new Set(["runs", "answer", "places", "watching", "push", "activity"]);

/**
 * An app on the HTTP transport that refuses what it must. `watch` says
 * whether it serves devices; `leaky` is a place key it wrongly lets into
 * the watch calls, as an app that looks for a watch key among places would.
 */
function app(o: { watch: boolean; alerts?: boolean; leaky?: string }): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path === "/.well-known/wake") {
      return Response.json({
        version: "wake/v1",
        transport: "http",
        httpBase: "https://app.example.com/api",
      });
    }
    const route = path.replace("/api/wake/v1/", "");
    const body: unknown = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const hasCode = typeof body === "object" && body !== null && "code" in body;
    const refuse = (status: number, error: string) => Response.json({ error }, { status });
    const missing = () => new Response("Not found", { status: 404 });
    if (route === "pair") return refuse(400, hasCode ? "code_invalid" : "invalid_body");
    if (route === "started" || route === "waiting") return missing();
    if (route === "watch" || WATCH_ROUTES.has(route)) {
      if (!o.watch) return missing();
      if (route === "watch") return refuse(400, hasCode ? "code_invalid" : "invalid_body");
      if (!o.alerts && (route === "push" || route === "activity")) return missing();
      const auth = new Headers(init?.headers).get("authorization");
      if (o.leaky && auth === `Bearer ${o.leaky}`) return Response.json([]);
    }
    return refuse(401, "unpaired");
  }) as typeof fetch;
}

describe("devices that watch", () => {
  test("an app that makes no watch codes passes, and says its runs reach no device", async () => {
    const probes = await checkApp("app.example.com", app({ watch: false }));
    expect(probes.filter((probe) => !probe.ok)).toEqual([]);
    expect(probes.at(-1)).toEqual({
      what: "Devices that watch aren't served",
      ok: true,
      detail: "its runs reach no device",
    });
    expect(probes.map((probe) => probe.what)).toContain("waiting (optional) isn't served");
  });

  test("an app that does: the watch route and every call refuse what they must", async () => {
    const probes = await checkApp("app.example.com", app({ watch: true }));
    expect(probes.filter((probe) => !probe.ok)).toEqual([]);
    expect(probes.slice(-3)).toEqual([
      { what: "Watch refuses a code nobody issued: 400 code_invalid", ok: true },
      { what: "Watch refuses a body of the wrong shape: 400 invalid_body", ok: true },
      {
        what: "Each watch call refuses a key that opens nothing: 401 unpaired",
        ok: true,
        detail:
          "push: not served (it sends no alerts); activity: not served (it sends no alerts); pair this machine with the app to try a place key too",
      },
    ]);
  });

  test("this machine's place key is tried too, and an app that lets it in fails", async () => {
    const good = await checkApp("app.example.com", app({ watch: true, alerts: true }), PLACE_KEY);
    expect(good.at(-1)).toEqual({
      what: "Each watch call refuses this machine's place key: 401 unpaired",
      ok: true,
    });
    const leaky = app({ watch: true, alerts: true, leaky: PLACE_KEY });
    const bad = await checkApp("app.example.com", leaky, PLACE_KEY);
    expect(bad.at(-2)?.ok).toBe(true);
    expect(bad.at(-1)).toMatchObject({
      ok: false,
      detail: expect.stringContaining("runs: answered 200"),
    });
  });
});
