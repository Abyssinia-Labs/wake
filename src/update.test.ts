import { expect, test } from "bun:test";
import { installKindOf, isNewer, latestVersion } from "./commands/update";

test("a global Bun install is told from a checkout", () => {
  expect(
    installKindOf("/Users/a/.bun/install/global/node_modules/@abyssinia-labs/wake/src/cli.ts"),
  ).toBe("global");
  expect(installKindOf("/Users/a/Projects/wake/src/cli.ts")).toBe("source");
  expect(installKindOf(undefined)).toBe("source");
});

test("versions compare part by part, not as text", () => {
  expect(isNewer("0.1.10", "0.1.9")).toBe(true);
  expect(isNewer("0.2.0", "0.1.9")).toBe(true);
  expect(isNewer("0.1.5", "0.1.5")).toBe(false);
  expect(isNewer("0.1.4", "0.1.5")).toBe(false);
});

test("npm's latest is read, and anything else is refused", async () => {
  const answer = (body: unknown, status = 200) =>
    (async () => Response.json(body, { status })) as unknown as typeof fetch;
  expect(await latestVersion(answer({ latest: "0.1.6", next: "0.2.0-next" }))).toBe("0.1.6");
  await expect(latestVersion(answer({ latest: "../../etc" }))).rejects.toThrow("no latest");
  await expect(latestVersion(answer({}, 500))).rejects.toThrow("500");
});
