import { expect, test } from "bun:test";
import { defaults } from "./config";
import { bunNewEnough, machineChecks, type Probe, wakeChecks } from "./doctor";
import type { Exec } from "./exec";

const probe = (over: Partial<Probe> = {}): Probe => ({
  platform: "darwin",
  bunVersion: "1.3.3",
  exists: () => true,
  plist: "/p.plist",
  listener: 42,
  paused: false,
  ...over,
});

/** A machine with exactly these programs, and gh signed in or not. */
const machine =
  (programs: string[], ghSignedIn = true): Exec =>
  async (cmd) => {
    if (cmd[0] === "/usr/bin/which") {
      return { code: programs.includes(cmd[1] ?? "") ? 0 : 1, stdout: "", stderr: "" };
    }
    if (cmd[0] === "gh") return { code: ghSignedIn ? 0 : 1, stdout: "", stderr: "" };
    return { code: 0, stdout: "", stderr: "" };
  };

test("Bun's version is compared part by part", () => {
  expect(bunNewEnough("1.3.3")).toBe(true);
  expect(bunNewEnough("1.10.0")).toBe(true);
  expect(bunNewEnough("1.3.2")).toBe(false);
  expect(bunNewEnough("0.9.9")).toBe(false);
});

test("a machine with no agent fails, and says how to get one", async () => {
  const checks = await machineChecks(machine(["git", "gh"]), probe());
  const agents = checks.find((check) => check.what === "Agents");
  expect(agents?.level).toBe("fail");
  expect(agents?.fix).toContain("Claude Code");
});

test("a ready machine passes; gh signed out is a warning with its fix", async () => {
  const checks = await machineChecks(machine(["git", "gh", "claude", "herdr"], false), probe());
  expect(checks.filter((check) => check.level === "fail")).toEqual([]);
  expect(checks.find((check) => check.what === "GitHub CLI")?.fix).toBe("gh auth login");
  expect(checks.some((check) => check.what === "Agents: Claude Code")).toBe(true);
});

test("Wake's own state: unpaired, unapproved, not installed, paused", () => {
  const empty = wakeChecks(
    defaults(),
    probe({ exists: (path) => path !== "/p.plist", paused: true }),
  );
  const whats = empty.map((check) => check.what);
  expect(whats).toContain("Nothing paired");
  expect(whats).toContain("Not installed");
  expect(whats).toContain("Paused");
  const paired = {
    ...defaults(),
    apps: {
      "app.example.com/claude-a1": {
        domain: "app.example.com",
        app: "example",
        agent: { id: "a1", name: "Claude" },
        convexUrl: "https://c",
        httpBase: "https://h",
        pairedAt: 1,
      },
    },
  };
  const unapproved = wakeChecks(paired, probe());
  expect(unapproved.find((check) => check.what.includes("no repository approved"))?.fix).toContain(
    "--app app.example.com",
  );
  const approved = wakeChecks(
    { ...paired, repos: { "app.example.com": ["acme/widgets"] } },
    probe(),
  );
  expect(approved.some((check) => check.what === "app.example.com may run in acme/widgets")).toBe(
    true,
  );
});
