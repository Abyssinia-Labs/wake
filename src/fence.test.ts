import { describe, expect, test } from "bun:test";
import type { ClaudeRun } from "./claude";
import { claudeAllowed, claudeDenied, claudeSettings, HOSTS, SECRETS } from "./fence";

const run: ClaudeRun = {
  cwd: "/w/gat-70-x",
  sessionId: "0b0e6a3c-1111-4222-8333-444455556666",
  prompt: "x",
  mcpServer: "gatherd",
  defaultBranch: "main",
  branch: "gat-70-x",
  extraAllowedTools: [],
  timeoutMs: 1000,
};

describe("a repository run", () => {
  const allowed = claudeAllowed(run);
  const denied = claudeDenied("main");

  test("pushes its own branch only, and nothing reads everything or runs everything", () => {
    expect(allowed).toContain("Bash(git push -u origin gat-70-x)");
    expect(allowed.some((rule) => rule.includes("main"))).toBe(false);
    for (const wide of [
      "Read",
      "Edit",
      "Write",
      "Bash",
      "Bash(git:*)",
      "Bash(gh:*)",
      "Bash(bunx:*)",
    ]) {
      expect(allowed).not.toContain(wide);
    }
    expect(allowed).toContain("Edit(./**)");
    expect(allowed).toContain("mcp__gatherd");
  });

  test("the ways out it knows of are denied, the person's credentials above all", () => {
    for (const rule of [
      "Bash(gh pr merge *)",
      "Bash(gh api *)",
      "Bash(gh auth *)",
      "Bash(git -c *)",
      "Bash(git config *)",
      "Bash(git push --mirror *)",
      "Bash(bunx *)",
      "Bash(git push origin main *)",
      "Read(~/.ssh/**)",
      "Read(~/.config/gh/**)",
    ]) {
      expect(denied).toContain(rule);
    }
  });

  test("its shell is sandboxed: no fallback, credentials unreadable, GitHub and npm only", () => {
    const sandbox = claudeSettings(run).sandbox as Record<string, unknown>;
    expect(sandbox).toMatchObject({
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      autoAllowBashIfSandboxed: true,
      filesystem: { denyRead: SECRETS },
      network: { allowedDomains: HOSTS },
    });
    expect(sandbox.excludedCommands).toEqual(["git push *", "git fetch *", "git pull *", "gh *"]);
  });
});

describe("a room run", () => {
  test("has the app's tools, and its shell asks and reaches nothing", () => {
    const room = { ...run, defaultBranch: undefined, branch: undefined, mcpServer: "antescript" };
    expect(claudeAllowed(room)).toEqual(["mcp__antescript"]);
    expect(claudeSettings(room).sandbox).toMatchObject({
      autoAllowBashIfSandboxed: false,
      excludedCommands: [],
      network: { allowedDomains: [] },
    });
  });
});
