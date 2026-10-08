import { describe, expect, test } from "bun:test";
import { appOrigin, discover, type Fetch, HttpError, isUnpaired, placeToken } from "./http";

describe("appOrigin", () => {
  test("https for a domain, http only for this machine", () => {
    expect(appOrigin("gatherd.dev")).toBe("https://gatherd.dev");
    expect(appOrigin("localhost:3005")).toBe("http://localhost:3005");
    expect(appOrigin("https://gatherd.dev/")).toBe("https://gatherd.dev");
    expect(appOrigin("localhost.evil.com")).toBe("https://localhost.evil.com");
  });
});

describe("routes", () => {
  test("discovery reads the well-known document and refuses redirects", async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher: Fetch = async (url, init) => {
      seen.push({ url, init });
      return Response.json({ version: "wake/v1", convexUrl: "wss://c", httpBase: "https://h" });
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
      return Response.json({ token: "jwt", expiresAt: 5 });
    };
    expect(await placeToken({ httpBase: "https://h" }, "pk_secret", fetcher)).toEqual({
      token: "jwt",
      expiresAt: 5,
    });
    expect(auth).toBe("Bearer pk_secret");
    expect(url).not.toContain("pk_secret");
  });

  test("a refusal reads as unpaired, with the app's code", async () => {
    const fetcher: Fetch = async () => Response.json({ error: "agent_stopped" }, { status: 403 });
    const error = await placeToken({ httpBase: "https://h" }, "k", fetcher).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(isUnpaired(error)).toBe(true);
    expect((error as HttpError).code).toBe("agent_stopped");
  });

  test("a server error is not unpaired", () => {
    expect(isUnpaired(new HttpError(502, "x"))).toBe(false);
  });
});
