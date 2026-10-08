import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClaudeRun } from "./claude";
import { defaults, type PairedApp, type Paths } from "./config";
import type { Summons } from "./contract";
import { exec } from "./exec";
import { composePrompt, type RunDeps, runSummons } from "./run";

const home = await mkdtemp(join(tmpdir(), "wake-run-"));
afterAll(() => rm(home, { recursive: true, force: true }));

const p: Paths = {
  home,
  config: join(home, "config.json"),
  state: join(home, "state.json"),
  paused: join(home, "paused"),
  worktrees: join(home, "worktrees"),
  made: join(home, "worktrees.json"),
  rooms: join(home, "rooms"),
  log: join(home, "wake.log"),
};
const app: PairedApp = {
  domain: "antescript.dev",
  app: "antescript",
  agent: { id: "a1", name: "Claude" },
  convexUrl: "wss://c",
  httpBase: "https://h",
  pairedAt: 1,
};
const page: Summons = {
  id: "s1",
  app: "antescript",
  kind: "mentioned",
  target: { kind: "page", ref: "Launch plan", url: "https://antescript.dev/p/1" },
  at: 1,
};

function deps(seen: ClaudeRun[], ok = true): RunDeps {
  return {
    exec,
    newId: () => "11111111-2222-4333-8444-555555555555",
    claude: async (run) => {
      seen.push(run);
      return ok ? { ok: true } : { ok: false, reason: "Out of turns." };
    },
  };
}

describe("runSummons", () => {
  test("a summons with no repository runs in the app's room with its tools only", async () => {
    const seen: ClaudeRun[] = [];
    const started: string[] = [];
    const outcome = await runSummons(page, { prompt: "Read the thread." }, app, {
      config: defaults(),
      paths: p,
      deps: deps(seen),
      onStart: (s) => started.push(s.cwd),
    });
    expect(outcome).toEqual({ id: "s1", outcome: "done" });
    expect(seen[0]?.cwd).toBe(join(home, "rooms", "antescript"));
    expect(seen[0]?.defaultBranch).toBeUndefined();
    expect(seen[0]?.mcpServer).toBe("antescript");
    expect(started).toEqual([join(home, "rooms", "antescript")]);
  });

  test("a missing clone fails without starting anything or naming local folders", async () => {
    const seen: ClaudeRun[] = [];
    const ticket = { ...page, repo: "abyssinia-labs/nowhere", branch: "gat-1-x" };
    const config = { ...defaults(), roots: [join(home, "empty")] };
    const outcome = await runSummons(ticket, { prompt: "x" }, app, {
      config,
      paths: p,
      deps: deps(seen),
      onStart: () => {},
    });
    expect(outcome.outcome).toBe("failed");
    expect(outcome.reason).not.toContain(home);
    expect(seen).toEqual([]);
  });

  test("a failed run carries Claude Code's reason", async () => {
    const outcome = await runSummons(page, { prompt: "x" }, app, {
      config: defaults(),
      paths: p,
      deps: deps([], false),
      onStart: () => {},
    });
    expect(outcome).toEqual({ id: "s1", outcome: "failed", reason: "Out of turns." });
  });

  test("the prompt is the app's, with the summons and session at its foot", () => {
    const prompt = composePrompt({ prompt: "  Read the thread.\n" }, page, "sess");
    expect(prompt.startsWith("Read the thread.\n")).toBe(true);
    expect(prompt).toContain("Summons s1: mentioned, Launch plan");
    expect(prompt.endsWith("Session sess.")).toBe(true);
  });
});
