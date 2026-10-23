import { expect, test } from "bun:test";
import { takesJson } from "./commands/json";
import { defaults } from "./config";
import { historyJson, modelsJson, statusJson } from "./json";

const app = (agent: string, tool?: "claude" | "codex" | "cursor") => ({
  domain: "gatherd.dev",
  app: "gatherd",
  agent: { id: agent, name: agent },
  convexUrl: "wss://c",
  httpBase: "https://h",
  pairedAt: 1,
  ...(tool ? { tool } : {}),
});

const config = {
  ...defaults(),
  roots: ["/Users/m/Projects"],
  models: { claude: { model: "opus", effort: "high" } },
  repos: { "gatherd.dev": ["acme/widgets"] },
  apps: {
    "gatherd.dev": app("Claude"),
    "gatherd.dev/codex-1": app("Codex", "codex"),
    "gatherd.dev/cursor-1": app("Cursor", "cursor"),
    "gatherd.dev/claude-2": app("Claude 2"),
    "gatherd.dev/other": app("Helper"),
  },
};

test("status: the listener, each pairing's connection, the runs and the settings", () => {
  const out = statusJson({
    config,
    paused: true,
    state: {
      pid: 7,
      startedAt: 100,
      updatedAt: 200,
      apps: {
        "gatherd.dev": { agent: "Claude", connected: true, unpaired: false },
        "gatherd.dev/codex-1": {
          agent: "Codex",
          connected: false,
          unpaired: false,
          missing: "codex",
        },
        "gatherd.dev/cursor-1": { agent: "Cursor", connected: false, unpaired: true },
        "gatherd.dev/claude-2": { agent: "Claude 2", connected: false, unpaired: false },
      },
      runs: [
        {
          app: "gatherd",
          ref: "GAT-20",
          sessionId: "s-1",
          cwd: "/w/gat-20",
          startedAt: 150,
          name: "amber-heron",
        },
        {
          app: "gatherd",
          ref: "GAT-21",
          sessionId: "",
          cwd: "/w/gat-21",
          startedAt: 160,
          tool: "codex",
          waiting: { since: 170, what: "Run this command? · git push" },
        },
      ],
    },
  });
  expect(out.listener).toEqual({ running: true, pid: 7, startedAt: 100 });
  expect(out.paused).toBe(true);
  expect(out.apps.map((one) => [one.key, one.connection, one.tool])).toEqual([
    ["gatherd.dev", "listening", "claude"],
    ["gatherd.dev/codex-1", "tool-missing", "codex"],
    ["gatherd.dev/cursor-1", "refused", "cursor"],
    ["gatherd.dev/claude-2", "connecting", "claude"],
    ["gatherd.dev/other", "not-connected", null],
  ]);
  expect(out.apps[1]?.missing).toBe("codex");
  expect(out.apps[0]).not.toHaveProperty("missing");
  expect(out.apps[0]?.transport).toBe("convex");
  expect(out.runs).toEqual([
    {
      app: "gatherd",
      ref: "GAT-20",
      name: "amber-heron",
      tool: "claude",
      sessionId: "s-1",
      cwd: "/w/gat-20",
      startedAt: 150,
      resume: "claude --resume s-1",
      waiting: null,
    },
    {
      app: "gatherd",
      ref: "GAT-21",
      name: null,
      tool: "codex",
      sessionId: null,
      cwd: "/w/gat-21",
      startedAt: 160,
      resume: null,
      waiting: { since: 170, what: "Run this command? · git push" },
    },
  ]);
  expect(out.repos).toEqual({ "gatherd.dev": ["acme/widgets"] });
  expect(out.settings.models).toEqual({
    claude: { model: "opus", effort: "high" },
    codex: {},
    cursor: {},
  });
  expect(out.settings.roots).toEqual(["/Users/m/Projects"]);
});

test("status, not running: every pairing is not connected and nothing runs", () => {
  const out = statusJson({ config, state: null, paused: false });
  expect(out.listener).toEqual({ running: false });
  expect(new Set(out.apps.map((one) => one.connection))).toEqual(new Set(["not-connected"]));
  expect(out.runs).toEqual([]);
});

test("the output carries no key, whatever the config holds", () => {
  const text = JSON.stringify(statusJson({ config, state: null, paused: false }));
  expect(text).not.toMatch(/placeKey|watchKey|"key_hash"/);
});

test("models: every tool, empty where it runs its own default", () => {
  expect(modelsJson({ models: { cursor: { model: "composer-2.5" } } })).toEqual({
    claude: {},
    codex: {},
    cursor: { model: "composer-2.5" },
  });
});

test("open's list: newest first, with the resume command once there is a session", () => {
  const run = {
    summons: "s",
    app: "gatherd",
    ref: "GAT-1",
    tool: "codex" as const,
    cwd: "/w",
    startedAt: 1,
  };
  const out = historyJson([
    { ...run, name: "brisk-lark", sessionId: "t-1", outcome: "done" },
    { ...run, name: "misty-finch", sessionId: "" },
  ]);
  expect(out.map((one) => [one.name, one.resume])).toEqual([
    ["misty-finch", null],
    ["brisk-lark", "codex resume t-1"],
  ]);
});

test("only the commands that change nothing take --json", () => {
  for (const command of ["status", "repos", "model", "doctor", "open"]) {
    expect(takesJson(command)).toBe(true);
  }
  for (const command of ["pair", "install", "allow", "prune", "listen"]) {
    expect(takesJson(command)).toBe(false);
  }
});
