import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type OpenDeps, open, openGoing } from "./commands/open";
import type { Exec } from "./exec";
import { findTab, focusTab, runTabLabel } from "./herdr-tab";
import type { RunRecord } from "./history";
import type { ListenerState, RunState } from "./state";

// herdr 0.9.3's `tab list`, as it answered on a scratch session.
const TABS = {
  id: "cli:tab:list",
  result: {
    type: "tab_list",
    tabs: [
      { tab_id: "w1:t1", workspace_id: "w1", label: "1", focused: true },
      { tab_id: "w1:t3", workspace_id: "w1", label: "GAT-71 · amber-heron", focused: false },
    ],
  },
};
const NOT_RUNNING = JSON.stringify({
  id: "cli:tab:list",
  error: { code: "server_not_running", message: "no herdr server is running" },
});

function fakeHerdr(calls: string[][], listed: { code: number; out: string }): Exec {
  return async (cmd) => {
    calls.push(cmd);
    if (cmd[2] === "list") {
      return listed.code === 0
        ? { code: 0, stdout: listed.out, stderr: "" }
        : { code: listed.code, stdout: "", stderr: listed.out };
    }
    return { code: 0, stdout: "{}", stderr: "" };
  };
}

function fakeDeps(o: { inHerdr?: boolean; listed?: string; code?: number } = {}): {
  deps: OpenDeps;
  calls: string[][];
  attached: { args: string[]; cwd?: string }[];
} {
  const calls: string[][] = [];
  const attached: { args: string[]; cwd?: string }[] = [];
  return {
    calls,
    attached,
    deps: {
      exec: fakeHerdr(calls, { code: o.code ?? 0, out: o.listed ?? JSON.stringify(TABS) }),
      attach: async (args, cwd) => {
        attached.push({ args, ...(cwd ? { cwd } : {}) });
        return 3;
      },
      inHerdr: o.inHerdr ?? false,
    },
  };
}

const going: RunState = {
  app: "gatherd",
  ref: "GAT-71",
  sessionId: "f1d586c9",
  cwd: "/w",
  startedAt: 1,
  name: "amber-heron",
  summons: "s1",
  url: "https://gatherd.dev/t/GAT-71",
  herdr: true,
};

beforeAll(() => {
  process.env.NO_COLOR = "1";
});

describe("a run's tab in herdr", () => {
  test("is found by the label Wake gave it", () => {
    expect(runTabLabel("GAT-71", "amber-heron")).toBe("GAT-71 · amber-heron");
    expect(runTabLabel("--x", "amber-heron")).toBe("x · amber-heron");
    expect(findTab(TABS, "GAT-71 · amber-heron")).toBe("w1:t3");
    expect(findTab(TABS, "GAT-72 · brisk-lark")).toBeUndefined();
  });

  test("is focused by its id; one that isn't there is focused never", async () => {
    const calls: string[][] = [];
    const run = fakeHerdr(calls, { code: 0, out: JSON.stringify(TABS) });
    expect(await focusTab(run, "GAT-71 · amber-heron")).toBe("w1:t3");
    expect(calls).toEqual([
      ["herdr", "tab", "list"],
      ["herdr", "tab", "focus", "w1:t3"],
    ]);
    calls.length = 0;
    expect(await focusTab(run, "gone")).toBeUndefined();
    expect(calls).toEqual([["herdr", "tab", "list"]]);
  });

  test("herdr down says herdr's own reason", async () => {
    const run = fakeHerdr([], { code: 1, out: NOT_RUNNING });
    await expect(focusTab(run, "x")).rejects.toThrow(
      "herdr didn't list its tabs: no herdr server is running",
    );
  });
});

describe("opening a run that is still going", () => {
  test("in herdr: its tab is brought to the front and herdr shown here", async () => {
    const { deps, calls, attached } = fakeDeps();
    expect(await openGoing(going, deps)).toBe(3);
    expect(calls.at(-1)).toEqual(["herdr", "tab", "focus", "w1:t3"]);
    expect(attached).toEqual([{ args: ["herdr"] }]);
  });

  test("from a herdr pane: the tab is in front, and no herdr inside herdr", async () => {
    const { deps, calls, attached } = fakeDeps({ inHerdr: true });
    expect(await openGoing(going, deps)).toBe(0);
    expect(calls.at(-1)).toEqual(["herdr", "tab", "focus", "w1:t3"]);
    expect(attached).toEqual([]);
  });

  test("in herdr, its tab closed: said, and nothing started", async () => {
    const { deps, attached } = fakeDeps({ listed: JSON.stringify({ result: { tabs: [] } }) });
    await expect(openGoing(going, deps)).rejects.toThrow(
      "amber-heron is still going in herdr, but no tab there is called GAT-71 · amber-heron",
    );
    expect(attached).toEqual([]);
  });

  test("headless: refused with how to stop it, never a second resume", async () => {
    const { deps, calls, attached } = fakeDeps();
    const headless = { ...going, herdr: false };
    await expect(openGoing(headless, deps)).rejects.toThrow(
      "amber-heron is still going headless, so it can't be opened until it ends",
    );
    await expect(openGoing(headless, deps)).rejects.toThrow("wakectl stop amber-heron ends it.");
    expect(calls).toEqual([]);
    expect(attached).toEqual([]);
  });

  test("from an older listener, which didn't say where: refused the same way", async () => {
    const { deps, attached } = fakeDeps();
    const { herdr: _where, ...older } = going;
    await expect(openGoing(older, deps)).rejects.toThrow(
      "amber-heron is still going, so it can't be opened",
    );
    expect(attached).toEqual([]);
  });
});

describe("wakectl open <name>", () => {
  let home = "";
  const record: RunRecord = {
    name: "amber-heron",
    summons: "s1",
    app: "gatherd",
    ref: "GAT-71",
    tool: "claude",
    sessionId: "f1d586c9",
    cwd: "",
    startedAt: 1,
  };
  const state = (runs: RunState[]): ListenerState => ({
    pid: process.pid,
    startedAt: 0,
    updatedAt: 0,
    apps: {},
    runs,
  });

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), "wake-open-"));
    record.cwd = home;
    process.env.WAKE_HOME = home;
    await writeFile(join(home, "runs.json"), JSON.stringify([record]));
  });
  afterAll(async () => {
    delete process.env.WAKE_HOME;
    await rm(home, { recursive: true, force: true });
  });

  test("a run going headless is not resumed a second time", async () => {
    await writeFile(join(home, "state.json"), JSON.stringify(state([{ ...going, herdr: false }])));
    const { deps, attached } = fakeDeps();
    await expect(open("amber-heron", deps)).rejects.toThrow("still going headless");
    expect(attached).toEqual([]);
  });

  test("a run going in herdr opens its tab", async () => {
    await writeFile(join(home, "state.json"), JSON.stringify(state([going])));
    const { deps, attached } = fakeDeps();
    await open("amber-heron", deps);
    expect(attached).toEqual([{ args: ["herdr"] }]);
    process.exitCode = 0;
  });

  test("a run that has ended resumes on its session, in its folder", async () => {
    await writeFile(join(home, "state.json"), JSON.stringify(state([])));
    const { deps, attached } = fakeDeps();
    await open("amber-heron", deps);
    expect(attached).toEqual([{ args: ["claude", "--resume", "f1d586c9"], cwd: home }]);
    process.exitCode = 0;
  });
});
