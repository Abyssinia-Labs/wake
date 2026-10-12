import { expect, test } from "bun:test";
import { read, readPath, shown } from "./commands/read";
import type { Exec } from "./exec";

test("a comment's address becomes one fixed read, and nothing else does", () => {
  expect(readPath("https://github.com/acme/widgets/pull/13#discussion_r7")).toBe(
    "repos/acme/widgets/pulls/comments/7",
  );
  expect(readPath("https://github.com/acme/widgets/issues/12#issuecomment-9")).toBe(
    "repos/acme/widgets/issues/comments/9",
  );
  expect(readPath("https://github.com/acme/widgets/pull/13#issuecomment-9")).toBe(
    "repos/acme/widgets/issues/comments/9",
  );
  expect(readPath("https://github.com/acme/widgets/pull/13#pullrequestreview-5")).toBe(
    "repos/acme/widgets/pulls/13/reviews/5",
  );
  for (const bad of [
    "https://github.com/acme/widgets/pull/13",
    "https://evil.dev/acme/widgets/pull/13#discussion_r7",
    "https://github.com/acme/widgets/pull/13#discussion_r7 -X DELETE",
    "https://github.com/acme/../user/pull/1#discussion_r7",
    "repos/acme/widgets/pulls/comments/7",
  ]) {
    expect(readPath(bad)).toBeNull();
  }
});

test("shows who, where, the code it's on and what it says", () => {
  const out = shown({
    user: { login: "ada" },
    path: "src/login.ts",
    line: 42,
    diff_hunk: "@@ -40,3 +40,3 @@\n-  redirect(undefined)\n+  redirect(next)",
    body: "/wake handle a missing `next` too",
  });
  expect(out).toContain("ada, on src/login.ts:42:");
  expect(out).toContain("  +  redirect(next)");
  expect(out.endsWith("/wake handle a missing `next` too")).toBe(true);
});

test("asks gh for exactly that path, with no flags", async () => {
  const calls: string[][] = [];
  const run: Exec = async (cmd) => {
    calls.push(cmd);
    return { code: 0, stdout: JSON.stringify({ user: { login: "ada" }, body: "hi" }), stderr: "" };
  };
  await read("https://github.com/acme/widgets/pull/13#discussion_r7", run);
  expect(calls).toEqual([["gh", "api", "repos/acme/widgets/pulls/comments/7"]]);
  await expect(read("https://github.com/acme/widgets/pull/13", run)).rejects.toThrow(
    "GitHub comment's address",
  );
});
