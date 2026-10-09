import { describe, expect, test } from "bun:test";
import { appOrigin, discover, type Fetch, forgetPlace, HttpError, isUnpaired } from "./http";

describe("appOrigin", () => {
  test("https for a domain, http only for this machine", () => {
    expect(appOrigin("gatherd.dev")).toBe("https://gatherd.dev");
    expect(appOrigin("localhost:3005")).toBe("http://localhost:3005");
    expect(appOrigin("https://gatherd.dev/")).toBe("https://gatherd.dev");
    expect(appOrigin("localhost.evil.com")).toBe("https://localhost.evil.com");
    expect(appOrigin("http://localhost:3005")).toBe("http://localhost:3005");
    expect(() => appOrigin("http://gatherd.dev")).toThrow("https only");
  });
});

describe("routes", () => {
  test("discovery reads the well-known document and refuses redirects", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: Fetch = async (url, init) => {
      seen.push({ url, init });
      return Response.json({ version: "wake/v1", convexUrl: "https://c", httpBase: "https://h" });
    };
    const d = await discover("gatherd.dev", fetcher);
    expect(d.httpBase).toBe("https://h");
    expect(seen[0]?.url).toBe("https://gatherd.dev/.well-known/wake");
    expect(seen[0]?.init?.redirect).toBe("error");
  });

  test("the place key goes as a bearer token, not in the URL", async () => {
    let auth = "";
    let url = "";
    const fetcher: Fetch = async (u, init) => {
      url = u;
      auth = new Headers(init?.headers).get("authorization") ?? "";
      return new Response(null, { status: 204 });
    };
    await forgetPlace({ httpBase: "https://h" }, "gwk_secret", fetcher);
    expect(auth).toBe("Bearer gwk_secret");
    expect(url).toBe("https://h/wake/v1/forget");
  });

  test("a refusal reads as unpaired, with the app's code", async () => {
    const fetcher: Fetch = async () => Response.json({ error: "unpaired" }, { status: 401 });
    const error = await forgetPlace({ httpBase: "https://h" }, "k", fetcher).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(isUnpaired(error)).toBe(true);
    expect((error as HttpError).code).toBe("unpaired");
  });

  test("a server error is not unpaired", () => {
    expect(isUnpaired(new HttpError(502, "x"))).toBe(false);
  });
});
