import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClaudeRun } from "./claude";
import type { Exec } from "./exec";
import {
  agentName,
  claudeSettings,
  findString,
  findWorkspace,
  herdrRunning,
  nativeArgs,
  openingPrompt,
  runInHerdr,
} from "./herdr";
import { writeCursorPermissions } from "./runners/cursor";

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

describe("a question before the agent is ready", () => {
  test("waits for the person, then prompts", async () => {
    const calls: string[][] = [];
    const exec: Exec = async (cmd) => {
      calls.push(cmd);
      if (cmd[2] === "start") {
        return {
          code: 1,
          stdout: JSON.stringify({
            error: { code: "agent_not_ready", message: "blocked during startup" },
          }),
          stderr: "",
        };
      }
      const out =
        cmd[1] === "workspace"
          ? { result: { workspaces: [{ workspace_id: "w2", label: "Wake" }] } }
          : cmd[1] === "tab"
            ? { result: { root_pane: { pane_id: "w2:p7" } } }
            : { result: { agent: { status: "done" } } };
      return { code: 0, stdout: JSON.stringify(out), stderr: "" };
    };
    const said: string[] = [];
    const result = await runInHerdr(
      { ...base, tool: "codex", ref: "GAT-31", onEvent: (line) => said.push(line) },
      exec,
    );
    expect(result).toEqual({ ok: true });
    const order = calls.map((cmd) => `${cmd[1]} ${cmd[2]}`);
    expect(order.indexOf("agent wait")).toBeGreaterThan(order.indexOf("agent start"));
    expect(order.indexOf("agent prompt")).toBeGreaterThan(order.indexOf("agent wait"));
    expect(said.some((line) => line.startsWith("waiting for you in herdr"))).toBe(true);
  });
});

describe("a start herdr timed out on", () => {
  const started = (wait: { code: number; stdout: string }): { exec: Exec; calls: string[][] } => {
    const calls: string[][] = [];
    const exec: Exec = async (cmd) => {
      calls.push(cmd);
      if (cmd[2] === "start") {
        return {
          code: 1,
          stdout: JSON.stringify({
            error: { code: "timeout", message: "timed out waiting for agent startup" },
            id: "cli:agent:start",
          }),
          stderr: "",
        };
      }
      if (cmd[2] === "wait") return { ...wait, stderr: "" };
      const out =
        cmd[1] === "workspace"
          ? { result: { workspaces: [{ workspace_id: "w2", label: "Wake" }] } }
          : cmd[1] === "tab"
            ? { result: { root_pane: { pane_id: "w2:p8" } } }
            : { result: { agent: { status: "idle" } } };
      return { code: 0, stdout: JSON.stringify(out), stderr: "" };
    };
    return { exec, calls };
  };
  // Cursor's permissions file is written into the worktree, so a real folder.
  const cursor = { ...base, tool: "cursor" as const, ref: "GAT-31", defaultBranch: undefined };
  const inTemp = async (): Promise<typeof cursor> => ({
    ...cursor,
    cwd: await mkdtemp(join(tmpdir(), "wake-herdr-")),
  });

  test("Cursor is told the worktree is trusted", () => {
    expect(nativeArgs(cursor, "unused")).toEqual(["--trust", "--approve-mcps"]);
    expect(nativeArgs({ ...cursor, permissionMode: "auto" }, "unused")).toContain("--auto-review");
  });
  test("Cursor's project file has only the keys Cursor accepts, and an old one is replaced", async () => {
    const run = await inTemp();
    const file = join(run.cwd, ".cursor", "cli.json");
    await mkdir(join(run.cwd, ".cursor"), { recursive: true });
    await Bun.write(file, JSON.stringify({ version: 1, permissions: { allow: [], deny: [] } }));
    expect(
      await writeCursorPermissions(async () => ({ code: 1, stdout: "", stderr: "" }), run),
    ).toBe(true);
    const written: unknown = JSON.parse(await Bun.file(file).text());
    expect(Object.keys(written as object)).toEqual(["permissions"]);
  });
  test("a .cursor that is a link is refused, not written through", async () => {
    const run = await inTemp();
    const elsewhere = await mkdtemp(join(tmpdir(), "wake-elsewhere-"));
    await symlink(elsewhere, join(run.cwd, ".cursor"));
    const none: Exec = async () => ({ code: 1, stdout: "", stderr: "" });
    await expect(writeCursorPermissions(none, run)).rejects.toThrow("link");
    expect(await Bun.file(join(elsewhere, "cli.json")).exists()).toBe(false);
  });
  test("waits for the person as a blocked start does, then prompts", async () => {
    const { exec, calls } = started({ code: 0, stdout: "{}" });
    expect(await runInHerdr(await inTemp(), exec)).toEqual({ ok: true });
    expect(calls.some((cmd) => cmd[2] === "prompt")).toBe(true);
  });
  test("says what herdr said when it never saw the agent", async () => {
    const { exec, calls } = started({ code: 1, stdout: '{"error":{"code":"agent_not_found"}}' });
    const result = await runInHerdr(await inTemp(), exec);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("agent_not_found");
    expect(calls.some((cmd) => cmd[2] === "prompt")).toBe(false);
  });
});

describe("a turn that ended", () => {
  test("idle is finished too: herdr calls a watched turn idle, not done", async () => {
    const exec: Exec = async (cmd) => {
      const out =
        cmd[1] === "workspace"
          ? { result: { workspaces: [{ workspace_id: "w2", label: "Wake" }] } }
          : cmd[1] === "tab"
            ? { result: { root_pane: { pane_id: "w2:p9" } } }
            : { result: { agent: { status: "idle" } } };
      return { code: 0, stdout: JSON.stringify(out), stderr: "" };
    };
    expect(await runInHerdr({ ...base, tool: "codex", ref: "GAT-31" }, exec)).toEqual({ ok: true });
  });
});
