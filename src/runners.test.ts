import { describe, expect, test } from "bun:test";
import type { ClaudeRun, Spawn } from "./claude";
import { pairingKey } from "./commands/pair";
import { codexArgs, codexPrompt, describeCodexEvent, runCodex } from "./runners/codex";
import { asCursorRule, cursorArgs, cursorPermissions, describeCursorEvent } from "./runners/cursor";
import { resumeLine } from "./tools";

const base: ClaudeRun = {
  cwd: "/repo/.claude/worktrees/gat-9-x",
  sessionId: "11111111-2222-4333-8444-555555555555",
  prompt: "Gatherd started you. Read GAT-9.",
  mcpServer: "gatherd",
  defaultBranch: "main",
  extraAllowedTools: ["Bash(npm test:*)"],
  timeoutMs: 60_000,
};

describe("Codex", () => {
  test("headless in the worktree, sandboxed to it, with network to push", () => {
    const args = codexArgs(base);
    expect(args.slice(0, 3)).toEqual(["codex", "exec", "--json"]);
    expect(args.join(" ")).toContain(
      "--sandbox workspace-write -c sandbox_workspace_write.network_access=true",
    );
    expect(args.at(-1)).toBe("-");
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(codexArgs({ ...base, permissionMode: "auto" })).toContain("--approve-for-me");
  });

  test("the rules ride in the prompt, without a session id it cannot know", () => {
    const prompt = codexPrompt(base);
    expect(prompt).toContain(
      "comment where you were asked that you are on it, so the person knows",
    );
    expect(prompt).not.toContain(base.sessionId);
    expect(prompt.endsWith(base.prompt)).toBe(true);
  });

  test("its events read as steps, and its thread id is the session", async () => {
    expect(
      describeCodexEvent(
        JSON.stringify({
          type: "item.completed",
          item: { type: "command_execution", command: "git status" },
        }),
      ),
    ).toBe("command: git status");
    expect(
      describeCodexEvent(
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Done." } }),
      ),
    ).toBe("said: Done.");
    const sessions: string[] = [];
    const spawn: Spawn = async (_args, o) => {
      o.onLine(JSON.stringify({ type: "thread.started", thread_id: "01a1-thread" }));
      o.onLine(JSON.stringify({ type: "turn.completed", usage: {} }));
      return { code: 0, timedOut: false };
    };
    expect(await runCodex({ ...base, onSession: (id) => sessions.push(id) }, spawn)).toEqual({
      ok: true,
    });
    expect(sessions).toEqual(["01a1-thread"]);
  });

  test("a failed turn is a failed run, with Codex's reason", async () => {
    const spawn: Spawn = async (_args, o) => {
      o.onLine(JSON.stringify({ type: "turn.failed", error: { message: "usage limit reached" } }));
      return { code: 1, timedOut: false };
    };
    expect(await runCodex(base, spawn)).toEqual({ ok: false, reason: "usage limit reached" });
  });
});

describe("Cursor", () => {
  test("the same fences as Claude Code, in Cursor's spelling", () => {
    const { allow, deny } = cursorPermissions(base);
    expect(allow).toEqual(
      expect.arrayContaining(["Shell(git)", "Shell(gh)", "Mcp(gatherd:*)", "Shell(npm:test*)"]),
    );
    expect(deny).toEqual(
      expect.arrayContaining([
        "Shell(gh:pr merge*)",
        "Shell(git:push origin main*)",
        "Shell(git:push --force*)",
      ]),
    );
    expect(cursorPermissions({ ...base, defaultBranch: undefined })).toEqual({
      allow: ["Mcp(gatherd:*)"],
      deny: ["Shell(*)", "Write(**)"],
    });
  });

  test("a rule from wakectl allow is translated, and one it cannot read is left out", () => {
    expect(asCursorRule("Bash(npm test:*)")).toBe("Shell(npm:test*)");
    expect(asCursorRule("Bash(make:*)")).toBe("Shell(make)");
    expect(asCursorRule("Shell(make)")).toBe("Shell(make)");
    expect(asCursorRule("WebSearch")).toBeNull();
  });

  test("headless, trusted, its MCP servers approved, the prompt one argument", () => {
    const args = cursorArgs(base);
    expect(args.slice(0, 4)).toEqual(["cursor-agent", "-p", "--output-format", "stream-json"]);
    expect(args).toContain("--trust");
    expect(args).toContain("--approve-mcps");
    expect(args).not.toContain("--force");
    expect(args.at(-1)?.endsWith(base.prompt)).toBe(true);
  });

  test("its tool calls read as steps", () => {
    const started = {
      type: "tool_call",
      subtype: "started",
      tool_call: { shellToolCall: { args: { command: "git push -u origin gat-9-x" } } },
    };
    expect(describeCursorEvent(JSON.stringify(started))).toBe("shell: git push -u origin gat-9-x");
    expect(describeCursorEvent(JSON.stringify({ ...started, subtype: "completed" }))).toBeNull();
  });
});

describe("pairings and sessions", () => {
  test("a pairing is keyed by its domain and its agent", () => {
    expect(pairingKey("gatherd.dev", { id: "j974w1ceam6q", name: "Codex (Michael)" })).toBe(
      "gatherd.dev/codex-michael-j974w1",
    );
  });
  test("each tool resumes its own way", () => {
    expect(resumeLine("claude", "s")).toBe("claude --resume s");
    expect(resumeLine("codex", "s")).toBe("codex resume s");
    expect(resumeLine("cursor", "s")).toBe("cursor-agent --resume s");
  });
});
