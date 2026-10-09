import { expect, test } from "bun:test";
import { checkApp } from "./commands/check";

test("an app that doesn't serve discovery fails at the first probe, and nothing else is tried", async () => {
  const seen: string[] = [];
  const fetcher = (async (url: string | URL | Request) => {
    seen.push(String(url));
    return new Response("not here", { status: 404 });
  }) as typeof fetch;
  const probes = await checkApp("app.example.com", fetcher);
  expect(probes).toEqual([
    { what: "Discovery", ok: false, detail: expect.stringContaining("404") },
  ]);
  expect(seen).toEqual(["https://app.example.com/.well-known/wake"]);
});

test("discovery that points at plain http elsewhere fails", async () => {
  const fetcher = (async () =>
    Response.json({
      version: "wake/v1",
      convexUrl: "http://c.example.com",
      httpBase: "https://h",
    })) as unknown as typeof fetch;
  const [first] = await checkApp("app.example.com", fetcher);
  expect(first?.ok).toBe(false);
});
