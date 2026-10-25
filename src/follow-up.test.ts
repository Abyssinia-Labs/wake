// A follow-up on the same ask continues the run that answered the last one:
// found in the history, resumed by each tool, and in herdr asked in the tab
// that is still open; a new session only when there is none to continue.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ClaudeRun, claudeArgs } from "./claude";
import { defaults, type PairedApp, type Paths, writeJson } from "./config";
import type { RunReport, Summons } from "./contract";
import { type Exec, exec } from "./exec";
import { runInHerdr } from "./herdr";
import { FOLLOW_UP_DAYS, lastRunOn, type RunRecord } from "./history";
import { type RunDeps, runSummons } from "./run";
import { codexArgs } from "./runners/codex";
import { cursorArgs } from "./runners/cursor";

const home = await mkdtemp(join(tmpdir(), "wake-follow-up-"));
afterAll(() => rm(home, { recursive: true, force: true }));

const DAY = 24 * 60 * 60_000;
const now = Date.now();
const room = join(home, "rooms", "gatherd");
const earlier: RunRecord = {
  name: "amber-heron",
  summons: "s1",
  app: "gatherd",
  ref: "GAT-12",
  tool: "claude",
  sessionId: "0b0e6a3c-1111-4222-8333-444455556666",
  cwd: room,
  startedAt: now - 2 * 60 * 60_000,
  finishedAt: now - 60 * 60_000,
  outcome: "done",
};
const wanted = { app: "gatherd", ref: "GAT-12", tool: "claude" as const, cwd: room, now };

describe("the run a follow-up continues", () => {
  test("is the latest finished one of the same app, ask, tool and folder", () => {
    const later = {
      ...earlier,
      summons: "s2",
      name: "quiet-otter",
      sessionId: "s-2",
      startedAt: now - 30 * 60_000,
      finishedAt: now - 20 * 60_000,
    };
    expect(lastRunOn([earlier, later], wanted)?.name).toBe("quiet-otter");
  });
  test("is none for another ask, tool, folder or app, a run still going, or no session", () => {
    expect(lastRunOn([{ ...earlier, ref: "GAT-13" }], wanted)).toBeUndefined();
    expect(lastRunOn([{ ...earlier, tool: "codex" }], wanted)).toBeUndefined();
    expect(lastRunOn([{ ...earlier, cwd: "/elsewhere" }], wanted)).toBeUndefined();
    expect(lastRunOn([{ ...earlier, app: "antescript" }], wanted)).toBeUndefined();
    const { finishedAt: _, ...going } = earlier;
    expect(lastRunOn([going], wanted)).toBeUndefined();
    expect(lastRunOn([{ ...earlier, sessionId: "" }], wanted)).toBeUndefined();
  });
  test(`is none once its session is older than ${FOLLOW_UP_DAYS} days`, () => {
    const old = { ...earlier, finishedAt: now - (FOLLOW_UP_DAYS + 1) * DAY };
    expect(lastRunOn([old], wanted)).toBeUndefined();
  });
});

const base: ClaudeRun = {
  cwd: "/tmp/w",
  sessionId: earlier.sessionId,
  prompt: "Why did you rename the hook?",
  mcpServer: "gatherd",
  extraAllowedTools: [],
  timeoutMs: 1000,
  resume: true,
};

describe("each tool resumes the session", () => {
  test("Claude Code with --resume, never a new --session-id", () => {
    const args = claudeArgs(base);
    expect(args[args.indexOf("--resume") + 1]).toBe(base.sessionId);
    expect(args).not.toContain("--session-id");
    expect(claudeArgs({ ...base, resume: false })).toContain("--session-id");
  });
  test("Codex with exec resume, run from the worktree, sandboxed as before", () => {
    const args = codexArgs({ ...base, tool: "codex" });
    expect(args.slice(0, 3)).toEqual(["codex", "exec", "resume"]);
    expect(args.slice(-2)).toEqual([base.sessionId, "-"]);
    expect(args).toContain('sandbox_mode="workspace-write"');
    expect(args).not.toContain("--cd");
  });
  test("Cursor with --resume", () => {
    const args = cursorArgs({ ...base, tool: "cursor" });
    expect(args[args.indexOf("--resume") + 1]).toBe(base.sessionId);
  });
});

describe("in herdr", () => {
  const herdrExec =
    (agentThere: boolean, calls: string[][]): Exec =>
    async (cmd) => {
      calls.push(cmd);
      if (cmd[1] === "agent" && cmd[2] === "get")
        return { code: agentThere ? 0 : 1, stdout: "{}", stderr: "" };
      const out =
        cmd[1] === "workspace" && cmd[2] === "list"
          ? { result: { workspaces: [{ workspace_id: "w2", label: "Wake" }] } }
          : cmd[1] === "tab"
            ? { result: { root_pane: { pane_id: "w2:p5" } } }
            : { result: {} };
      return { code: 0, stdout: JSON.stringify(out), stderr: "" };
    };

  test("a follow-up goes to the agent still open in its tab, and opens no tab", async () => {
    const calls: string[][] = [];
    expect(await runInHerdr({ ...base, ref: "GAT-12" }, herdrExec(true, calls))).toEqual({
      ok: true,
    });
    expect(calls.some((cmd) => cmd[1] === "tab")).toBe(false);
    const prompt = calls.find((cmd) => cmd[2] === "prompt") ?? [];
    expect(prompt[3]).toBe("wake-gat-12-0b0e6a");
    expect(prompt[4]).toContain(base.prompt);
  });
  test("with its tab closed, it resumes the session in a new one", async () => {
    const calls: string[][] = [];
    expect(await runInHerdr({ ...base, ref: "GAT-12" }, herdrExec(false, calls))).toEqual({
      ok: true,
    });
    const start = calls.find((cmd) => cmd[2] === "start") ?? [];
    expect(start[start.indexOf("--resume") + 1]).toBe(base.sessionId);
    expect(start).not.toContain("--session-id");
  });
});

describe("runSummons", () => {
  const p: Paths = {
    home,
    config: join(home, "config.json"),
    state: join(home, "state.json"),
    paused: join(home, "paused"),
    worktrees: join(home, "worktrees"),
    made: join(home, "worktrees.json"),
    asked: join(home, "asked-repos.json"),
    history: join(home, "runs.json"),
    stops: join(home, "stop"),
    activity: join(home, "runs"),
    rooms: join(home, "rooms"),
    log: join(home, "wake.log"),
  };
  const app: PairedApp = {
    domain: "gatherd.dev",
    app: "gatherd",
    agent: { id: "a1", name: "Claude", tool: "claude" },
    convexUrl: "wss://c",
    httpBase: "https://h",
    pairedAt: 1,
  };
  const followUp: Summons = {
    id: "s9",
    app: "gatherd",
    kind: "mentioned",
    target: { kind: "ticket", ref: "GAT-12", url: "https://gatherd.dev/t/12" },
    at: now,
  };
  const deps = (seen: ClaudeRun[]): RunDeps => ({
    exec,
    herdrUp: async () => false,
    newId: () => "99999999-2222-4333-8444-555555555555",
    claude: async (run) => {
      seen.push(run);
      return { ok: true };
    },
  });

  test("continues the last run's session, under its name, and says it follows up", async () => {
    await writeJson(p.history, [earlier]);
    const seen: ClaudeRun[] = [];
    const names: string[] = [];
    const reported: RunReport[] = [];
    await runSummons(followUp, { prompt: "Why did you rename the hook?" }, app, {
      config: defaults(),
      paths: p,
      deps: deps(seen),
      onStart: (s) => names.push(s.name),
      report: async (run) => {
        reported.push(run);
        return true;
      },
    });
    expect(seen[0]?.resume).toBe(true);
    expect(seen[0]?.sessionId).toBe(earlier.sessionId);
    expect(seen[0]?.prompt).toContain("This follows up your earlier run on GAT-12, amber-heron");
    expect(names[0]).toBe("amber-heron");
    expect(reported[0]).toEqual({
      name: "amber-heron",
      tool: "claude",
      session: earlier.sessionId,
    });
  });

  test("starts a new session when there is none to continue", async () => {
    await writeJson(p.history, [{ ...earlier, ref: "GAT-99" }]);
    const seen: ClaudeRun[] = [];
    await runSummons(followUp, { prompt: "Fix it." }, app, {
      config: defaults(),
      paths: p,
      deps: deps(seen),
      onStart: () => {},
    });
    expect(seen[0]?.resume).toBeUndefined();
    expect(seen[0]?.sessionId).toBe("99999999-2222-4333-8444-555555555555");
    expect(seen[0]?.prompt).not.toContain("follows up");
  });
});
