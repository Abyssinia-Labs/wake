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
    const auto = claudeArgs({ ...base, permissionMode: "auto" });
    expect(auto[auto.indexOf("--permission-mode") + 1]).toBe("auto");
    expect(args.join(" ")).not.toContain("bypassPermissions");
    expect(args).not.toContain(base.prompt);
    expect(args).toContain(base.sessionId);
    expect(args.join(" ")).toContain("--output-format stream-json --verbose");
    expect(claudeArgs({ ...base, name: "GAT-37 · Wake" }).join(" ")).toContain(
      "--name GAT-37 · Wake",
    );
  });

  test("asks for a comment before anything else, naming the session", () => {
    const args = claudeArgs(base);
    const rules = args[args.indexOf("--append-system-prompt") + 1] ?? "";
    expect(rules).toContain(
      "Before anything else, comment where you were asked that you are on it",
    );
    expect(rules).toContain(base.sessionId);
    // A question is answered, not acted on (GAT-20, 2026-10-08).
    expect(rules).toContain(
      "a question is answered in a comment, and code changes only when the ask is for a change",
    );
    expect(rules).not.toContain("Then do the work");
  });

  test("the branch's settings are left out; Wake's own come as one --settings", () => {
    const args = claudeArgs({ ...base, branch: "gat-70-x" });
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("user");
    const settings: unknown = JSON.parse(args[args.indexOf("--settings") + 1] ?? "{}");
    expect(settings).toMatchObject({ sandbox: { enabled: true, failIfUnavailable: true } });
    expect(args).not.toContain("--allowedTools");
  });
});

describe("results", () => {
  test("reads the stream's final result event", () => {
    expect(readResult(0, { type: "result", is_error: false, result: "ok" })).toEqual({ ok: true });
    expect(
      readResult(1, { type: "result", is_error: true, result: "Credit balance too low" }),
    ).toEqual({
      ok: false,
      reason: "Credit balance too low",
    });
    expect(readResult(2, null)).toEqual({ ok: false, reason: "claude exited 2." });
  });

  test("streams: each step is reported as it comes, and the last result decides", async () => {
    const seen: string[] = [];
    const spawn: Spawn = async (_args, o) => {
      o.onLine(JSON.stringify({ type: "system", subtype: "init", model: "claude-opus-5-5" }));
      o.onLine(
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", name: "mcp__gatherd__addcomment", input: { key: "GAT-37" } },
            ],
          },
        }),
      );
      o.onLine(JSON.stringify({ type: "result", is_error: false, result: "Done.", num_turns: 4 }));
      return { code: 0, timedOut: false };
    };
    const result = await runClaude({ ...base, onEvent: (line) => seen.push(line) }, spawn);
    expect(result).toEqual({ ok: true });
    expect(seen).toEqual([
      "began (claude-opus-5-5)",
      "addcomment: GAT-37",
      "finished after 4 turns",
    ]);
  });

  test("the prompt goes on stdin, and a timeout is a failure", async () => {
    let stdin = "";
    const spawn: Spawn = async (_args, o) => {
      stdin = o.stdin;
      return { code: 143, timedOut: true };
    };
    const result = await runClaude({ ...base, timeoutMs: 120 * 60_000 }, spawn);
    expect(stdin).toBe(base.prompt);
    expect(result).toEqual({ ok: false, reason: "Stopped after 120 minutes." });
  });
});
