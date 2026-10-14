import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClaudeRun, Spawn } from "./claude";
import { Shareable } from "./errors";
import type { Exec } from "./exec";
import { runCursor } from "./runners/cursor";
import {
  cursorChecks,
  readMcpList,
  requireCursorSignIn,
  signInLine,
} from "./runners/cursor-signin";

// As `cursor-agent mcp list` printed it on 2026.10.01, colours included.
const LISTED = [
  "supabase: requires_authentication",
  "\u001b[32mconvex\u001b[39m: ready",
  "gatherd: requires_authentication",
  "gatherd-dev: ready",
  "probe: not loaded (needs approval)",
].join("\n");

const answering =
  (stdout: string, code = 0): Exec =>
  async () => ({ code, stdout, stderr: "" });

let dir = "";
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "wake-cursor-signin-"));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("reading mcp list", () => {
  test("each server's state, by its exact name", () => {
    expect(readMcpList(LISTED, "convex")).toEqual({ state: "ready" });
    expect(readMcpList(LISTED, "gatherd")).toEqual({ state: "signed-out" });
    expect(readMcpList(LISTED, "gatherd-dev")).toEqual({ state: "ready" });
    expect(readMcpList(LISTED, "probe")).toEqual({
      state: "other",
      status: "not loaded (needs approval)",
    });
    expect(readMcpList(LISTED, "antescript")).toEqual({ state: "missing" });
  });

  test("the sign-in line pastes safely, whatever the folder or name", () => {
    expect(signInLine("/Users/m/.cursor/worktrees/gatherd/gat-14", "gatherd")).toBe(
      "cd '/Users/m/.cursor/worktrees/gatherd/gat-14' && cursor-agent mcp login 'gatherd'",
    );
    expect(signInLine("/w/it's $(here)", "x")).toBe(
      "cd '/w/it'\\''s $(here)' && cursor-agent mcp login 'x'",
    );
  });
});

describe("before a run", () => {
  const run = { cwd: "/Users/m/.cursor/worktrees/gatherd/gat-14", mcpServer: "gatherd" };

  test("signed in, the run goes ahead", async () => {
    await requireCursorSignIn(answering("gatherd: ready\n"), run);
  });

  test("signed out, it is refused: the app hears why, this machine's log gets the fix", async () => {
    const said: string[] = [];
    const refused = requireCursorSignIn(answering(LISTED), {
      ...run,
      onEvent: (line) => said.push(line),
    });
    await expect(refused).rejects.toBeInstanceOf(Shareable);
    await expect(refused).rejects.toThrow("Cursor keeps MCP sign-ins per folder");
    // The folder stays on this machine.
    await expect(refused).rejects.not.toThrow(run.cwd);
    expect(said.join("\n")).toContain(signInLine(run.cwd, "gatherd"));
  });

  test("a server Cursor doesn't have, or hasn't approved, is refused too", async () => {
    await expect(
      requireCursorSignIn(answering(LISTED), { ...run, mcpServer: "antescript" }),
    ).rejects.toThrow("no MCP server named antescript");
    await expect(
      requireCursorSignIn(answering(LISTED), { ...run, mcpServer: "probe" }),
    ).rejects.toThrow("not loaded (needs approval)");
  });

  test("when Cursor can't say, or takes too long, the run goes ahead and the log says so", async () => {
    const said: string[] = [];
    await requireCursorSignIn(answering("", 1), { ...run, onEvent: (line) => said.push(line) });
    const slow: Exec = () => new Promise(() => {});
    await requireCursorSignIn(slow, { ...run, onEvent: (line) => said.push(line) }, 10);
    expect(said).toHaveLength(2);
    expect(said[0]).toContain("starting anyway");
  });

  test("a signed-out headless run never starts Cursor", async () => {
    const cwd = join(dir, "room");
    await mkdir(cwd, { recursive: true });
    const o: ClaudeRun = {
      cwd,
      sessionId: "s",
      prompt: "Read GAT-14.",
      mcpServer: "gatherd",
      extraAllowedTools: [],
      timeoutMs: 1000,
      tool: "cursor",
    };
    let spawned = false;
    const spawn: Spawn = async () => {
      spawned = true;
      return { code: 0, timedOut: false };
    };
    await expect(runCursor(o, answering(LISTED), spawn)).rejects.toThrow("isn't signed in");
    expect(spawned).toBe(false);
  });
});

test("doctor: each Cursor pairing's server is in Cursor's config", async () => {
  await mkdir(join(dir, ".cursor"), { recursive: true });
  await writeFile(
    join(dir, ".cursor", "mcp.json"),
    JSON.stringify({ mcpServers: { gatherd: { url: "https://x" } } }),
  );
  const checks = await cursorChecks(["gatherd", "antescript"], dir);
  expect(checks.map((check) => [check.level, check.what])).toEqual([
    ["ok", "Cursor has the gatherd MCP server"],
    ["warn", "Cursor has no antescript MCP server"],
    ["info", "Cursor signs in per folder"],
  ]);
  expect(await cursorChecks([], dir)).toEqual([]);
  expect((await cursorChecks(["gatherd"], join(dir, "nowhere")))[0]?.level).toBe("warn");
});
