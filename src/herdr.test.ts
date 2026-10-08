import { describe, expect, test } from "bun:test";
import type { ClaudeRun } from "./claude";
import type { Exec } from "./exec";
import {
  agentName,
  claudeSettings,
  findString,
  findWorkspace,
  herdrRunning,
  openingPrompt,
  runInHerdr,
} from "./herdr";

const base: ClaudeRun = {
  cwd: "/repo/.claude/worktrees/gat-37-x",
  sessionId: "0b0e6a3c-1111-4222-8333-444455556666",
  prompt: "Gatherd started you. `rm -rf ~` $(whoami) in a title",
  mcpServer: "gatherd",
  defaultBranch: "main",
  extraAllowedTools: [],
  timeoutMs: 60_000,
  name: "GAT-37 · Wake",
};

describe("shapes herdr accepts", () => {
  test("an agent name is lower case, short, and unique per run", () => {
    expect(agentName("GAT-37", base.sessionId)).toBe("wake-gat-37-0b0e6a");
    expect(agentName("GAT-37", base.sessionId)).toMatch(/^[a-z][a-z0-9_-]{0,31}$/);
  });
  test("the settings carry the same permissions -p gets as flags", () => {
    expect(claudeSettings(base)).toEqual({
      permissions: {
        defaultMode: "acceptEdits",
        allow: expect.arrayContaining(["Bash(git:*)", "mcp__gatherd"]),
        deny: expect.arrayContaining(["Bash(gh pr merge:*)", "Bash(git push origin main:*)"]),
      },
    });
  });
  test("the settings carry the chosen permission mode", () => {
    const settings = claudeSettings({ ...base, permissionMode: "dontAsk" });
    expect((settings.permissions as Record<string, unknown>).defaultMode).toBe("dontAsk");
  });

  test("the opening prompt is the live rules, then the app's prompt", () => {
    const text = openingPrompt(base);
    expect(text.startsWith("Wake started this session in herdr")).toBe(true);
    expect(text.endsWith(base.prompt)).toBe(true);
  });
  test("ids are found however herdr nests them", () => {
    expect(findString({ result: { tab: {}, root_pane: { pane_id: "w1:p3" } } }, ["pane_id"])).toBe(
      "w1:p3",
    );
    expect(
      findWorkspace({
        result: {
          workspaces: [
            { workspace_id: "w1", label: "api" },
            { workspace_id: "w2", label: "Wake" },
          ],
        },
      }),
    ).toBe("w2");
  });
});

describe("runInHerdr", () => {
  test("no ticket text reaches a command line except as the pasted prompt", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (cmd) => {
      calls.push(cmd);
      const out =
        cmd[1] === "workspace" && cmd[2] === "list"
          ? { result: { workspaces: [{ workspace_id: "w2", label: "Wake" }] } }
          : cmd[1] === "tab"
            ? { result: { root_pane: { pane_id: "w2:p5" } } }
            : { result: {} };
      return { code: 0, stdout: JSON.stringify(out), stderr: "" };
    };
    const result = await runInHerdr({ ...base, ref: "GAT-37" }, exec);
    expect(result).toEqual({ ok: true });
    const start = calls.find((cmd) => cmd[2] === "start") ?? [];
    expect(start.slice(0, 8)).toEqual([
      "herdr",
      "agent",
      "start",
      "wake-gat-37-0b0e6a",
      "--kind",
      "claude",
      "--pane",
      "w2:p5",
    ]);
    expect(start.join(" ")).not.toContain("rm -rf");
    expect(start).toContain("GAT-37·Wake");
    const prompt = calls.find((cmd) => cmd[2] === "prompt") ?? [];
    expect(prompt[4]).toContain("rm -rf");
    expect(prompt.slice(5)).toEqual([
      "--wait",
      "--until",
      "done",
      "--until",
      "idle",
      "--timeout",
      "60000",
    ]);
  });

  test("herdr not running reads as not running", async () => {
    const down: Exec = async () => ({
      code: 0,
      stdout: JSON.stringify({ status: "not_running", running: false }),
      stderr: "",
    });
    const up: Exec = async () => ({
      code: 0,
      stdout: JSON.stringify({ status: "running", running: true }),
      stderr: "",
    });
    expect(await herdrRunning(down)).toBe(false);
    expect(await herdrRunning(up)).toBe(true);
  });
});
