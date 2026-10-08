import { describe, expect, test } from "bun:test";
import { type ClaudeRun, claudeArgs, readResult, runClaude, type Spawn } from "./claude";

const base: ClaudeRun = {
  cwd: "/tmp/w",
  sessionId: "0b0e6a3c-1111-4222-8333-444455556666",
  prompt: "--dangerously-skip-permissions read GAT-70",
  mcpServer: "gatherd",
  defaultBranch: "main",
  extraAllowedTools: [],
  timeoutMs: 1000,
};

describe("claudeArgs", () => {
  test("accepts edits, never bypasses, and keeps the prompt off the command line", () => {
    const args = claudeArgs(base);
    expect(args.slice(0, 2)).toEqual(["claude", "-p"]);
    expect(args).toContain("acceptEdits");
    expect(args.join(" ")).not.toContain("bypassPermissions");
    expect(args).not.toContain(base.prompt);
    expect(args).toContain(base.sessionId);
  });

  test("a repository run gets code tools and fences on the default branch", () => {
    const args = claudeArgs(base);
    expect(args).toContain("Bash(git:*)");
    expect(args).toContain("mcp__gatherd");
    expect(args).toContain("Bash(gh pr merge:*)");
    expect(args).toContain("Bash(git push origin main:*)");
  });

  test("a room run gets the app's tools and nothing else", () => {
    const args = claudeArgs({ ...base, defaultBranch: undefined, mcpServer: "antescript" });
    const allowed = args.slice(
      args.indexOf("--allowedTools") + 1,
      args.indexOf("--disallowedTools"),
    );
    expect(allowed).toEqual(["mcp__antescript"]);
  });
});

describe("results", () => {
  test("reads Claude Code's JSON", () => {
    expect(readResult(0, JSON.stringify({ is_error: false, result: "ok" }))).toEqual({ ok: true });
    expect(
      readResult(1, JSON.stringify({ is_error: true, result: "Credit balance too low" })),
    ).toEqual({
      ok: false,
      reason: "Credit balance too low",
    });
    expect(readResult(2, "not json")).toEqual({ ok: false, reason: "claude exited 2." });
  });

  test("the prompt goes on stdin, and a timeout is a failure", async () => {
    let stdin = "";
    const spawn: Spawn = async (_args, o) => {
      stdin = o.stdin;
      return { code: 143, stdout: "", timedOut: true };
    };
    const result = await runClaude({ ...base, timeoutMs: 120 * 60_000 }, spawn);
    expect(stdin).toBe(base.prompt);
    expect(result).toEqual({ ok: false, reason: "Stopped after 120 minutes." });
  });
});
