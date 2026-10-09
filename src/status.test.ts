import { expect, test } from "bun:test";
import { statusLines } from "./commands/status";
import { defaults } from "./config";

const config = {
  ...defaults(),
  roots: ["/Users/m/Projects"],
  apps: {
    "gatherd.dev": {
      domain: "gatherd.dev",
      app: "gatherd",
      agent: { id: "a1", name: "Claude" },
      convexUrl: "wss://c",
      httpBase: "https://h",
      pairedAt: 1,
    },
  },
};

test("running: the listener, each app's connection, the runs and how they are set up", () => {
  process.env.NO_COLOR = "1";
  const lines = statusLines({
    config,
    paused: true,
    now: 30 * 60_000,
    state: {
      pid: 7,
      startedAt: 0,
      updatedAt: 0,
      apps: { "gatherd.dev": { agent: "Claude", connected: true, unpaired: false } },
      runs: [
        {
          app: "gatherd",
          ref: "GAT-20",
          sessionId: "s-1",
          cwd: "/w/gat-20",
          startedAt: 10 * 60_000,
        },
      ],
    },
  }).join("\n");
  expect(lines).toContain("● listening · pid 7 · up 30 min");
  expect(lines).toContain("paused");
  expect(lines).toMatch(/● gatherd\.dev\s+Claude\s+Claude Code\s+listening/);
  expect(lines).toMatch(/GAT-20\s+20 min/);
  expect(lines).toContain("claude --resume s-1");
  expect(lines).toMatch(/permissions\s+acceptEdits/);
  delete process.env.NO_COLOR;
});

test("not running, and nothing paired: says what to do", () => {
  process.env.NO_COLOR = "1";
  const lines = statusLines({
    config: { ...config, apps: {} },
    paused: false,
    now: 0,
    state: null,
  }).join("\n");
  expect(lines).toContain("○ not running · wakectl install");
  expect(lines).toContain("wakectl pair <domain> <code>");
  delete process.env.NO_COLOR;
});

test("says which repositories each app may run in, or that runs are refused", () => {
  process.env.NO_COLOR = "1";
  const none = statusLines({ config, paused: false, now: 0, state: null }).join("\n");
  expect(none).toContain("none approved");
  const some = statusLines({
    config: { ...config, repos: { "gatherd.dev": ["abyssinia-labs/gatherd"] } },
    paused: false,
    now: 0,
    state: null,
  }).join("\n");
  expect(some).toContain("abyssinia-labs/gatherd");
  expect(some).not.toContain("none approved");
});
