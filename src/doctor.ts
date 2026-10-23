// What a machine needs for Wake, checked one thing at a time, each with the
// command that fixes it. `wakectl doctor` prints the list; `wakectl setup`
// walks through it. Side effects go through `Exec` and `Probe`, so the
// checks are tested with fakes.
import { existsSync } from "node:fs";
import type { Config } from "./config";
import { AGENT_TOOLS, type AgentTool } from "./contract";
import { appRunsIt } from "./daemon";
import { linuxChecks } from "./doctor-linux";
import type { Exec } from "./exec";
import type { AppAgent } from "./launchd";
import { programOf, TOOL_NAMES, toolInstalled } from "./tools";
import { someOf, tildify } from "./ui";

export type Level = "ok" | "warn" | "fail" | "info";
export type Check = { level: Level; what: string; detail?: string; fix?: string };

/** What the checks read about the machine besides commands. */
export type Probe = {
  platform: string;
  bunVersion: string;
  exists: (path: string) => boolean;
  plist: string;
  /** An app that runs the listener itself (daemon.ts), in place of Wake's own plist; else null. */
  appAgent: AppAgent | null;
  /** The running listener's pid, or null. */
  listener: number | null;
  paused: boolean;
};

export const realProbe = (o: Omit<Probe, "platform" | "bunVersion" | "exists">): Probe => ({
  platform: process.platform,
  bunVersion: Bun.version,
  exists: existsSync,
  ...o,
});

const MIN_BUN = [1, 3, 3];

export function bunNewEnough(version: string): boolean {
  const parts = version.split(".").map((n) => Number.parseInt(n, 10));
  for (let i = 0; i < MIN_BUN.length; i++) {
    const have = parts[i] ?? 0;
    const need = MIN_BUN[i] ?? 0;
    if (have !== need) return have > need;
  }
  return true;
}

async function has(run: Exec, program: string): Promise<boolean> {
  return (await run(["/usr/bin/which", program])).code === 0;
}

export async function machineChecks(run: Exec, probe: Probe): Promise<Check[]> {
  const checks: Check[] = [];
  const linux = probe.platform === "linux";
  checks.push(
    probe.platform === "darwin"
      ? { level: "ok", what: "macOS" }
      : linux
        ? { level: "ok", what: "Linux" }
        : { level: "fail", what: probe.platform, detail: "Wake runs on macOS and Linux." },
  );
  checks.push(
    bunNewEnough(probe.bunVersion)
      ? { level: "ok", what: `Bun ${probe.bunVersion}` }
      : {
          level: "fail",
          what: `Bun ${probe.bunVersion}`,
          detail: "Wake needs 1.3.3 or later.",
          fix: "bun upgrade",
        },
  );
  checks.push(
    (await has(run, "git"))
      ? { level: "ok", what: "git" }
      : {
          level: "fail",
          what: "git",
          fix: linux ? "sudo apt install git" : "xcode-select --install",
        },
  );
  if (!(await has(run, "gh"))) {
    checks.push({
      level: "warn",
      what: "GitHub CLI",
      detail: "Runs open pull requests with gh.",
      fix: linux ? "https://cli.github.com" : "brew install gh",
    });
  } else {
    const auth = await run(["gh", "auth", "status"]);
    checks.push(
      auth.code === 0
        ? { level: "ok", what: "GitHub CLI, signed in" }
        : { level: "warn", what: "GitHub CLI", detail: "Not signed in.", fix: "gh auth login" },
    );
  }
  const tools: AgentTool[] = [];
  for (const tool of AGENT_TOOLS) if (await toolInstalled(run, tool)) tools.push(tool);
  checks.push(
    tools.length > 0
      ? { level: "ok", what: `Agents: ${tools.map((tool) => TOOL_NAMES[tool]).join(", ")}` }
      : {
          level: "fail",
          what: "Agents",
          detail: `None found: Wake starts ${AGENT_TOOLS.map(programOf).join(", ")}.`,
          fix: "Install Claude Code: https://claude.com/claude-code",
        },
  );
  checks.push(
    (await has(run, "herdr"))
      ? { level: "info", what: "herdr", detail: "Runs can open as tabs: wakectl mode herdr" }
      : { level: "info", what: "herdr not installed", detail: "Runs stay in the background." },
  );
  if (linux) checks.push(...(await linuxChecks(run)));
  return checks;
}

export function wakeChecks(config: Config, probe: Probe): Check[] {
  const checks: Check[] = [];
  const roots = config.roots.filter((root) => probe.exists(root));
  checks.push(
    roots.length > 0
      ? { level: "ok", what: `Clones in ${roots.map((root) => tildify(root)).join(", ")}` }
      : {
          level: "fail",
          what: "Clone folders",
          detail: `None of ${config.roots.join(", ")} exists.`,
          fix: "wakectl setup",
        },
  );
  const domains = [...new Set(Object.values(config.apps).map((app) => app.domain))];
  if (domains.length === 0) {
    checks.push({
      level: "warn",
      what: "Nothing paired",
      detail: "Ask your agent to pair Wake with the app; it gives you the command.",
      fix: "wakectl pair <app domain> <code>",
    });
  }
  for (const domain of domains) {
    const repos = config.repos[domain] ?? [];
    checks.push(
      repos.length > 0
        ? { level: "ok", what: `${domain} may run in ${someOf(repos, "repositories")}` }
        : {
            level: "warn",
            what: `${domain}: no repository approved`,
            detail: "Its runs on code are refused until one is.",
            fix: `wakectl repos allow <owner/name> --app ${domain}`,
          },
    );
  }
  if (probe.appAgent) {
    const detail = `${appRunsIt(probe.appAgent)}; start at login is its setting.`;
    checks.push(
      probe.listener === null
        ? { level: "fail", what: "Run by an app, but not running", detail }
        : { level: "ok", what: `Listening (pid ${probe.listener})`, detail },
    );
  } else if (!probe.exists(probe.plist)) {
    checks.push({
      level: "warn",
      what: "Not installed",
      detail: "Nothing listens until it is.",
      fix: "wakectl install",
    });
  } else if (probe.listener === null) {
    checks.push({ level: "fail", what: "Installed but not running", fix: "wakectl logs" });
  } else {
    checks.push({ level: "ok", what: `Listening (pid ${probe.listener})` });
  }
  if (probe.paused) {
    checks.push({
      level: "warn",
      what: "Paused",
      detail: "Nothing new is claimed.",
      fix: "wakectl resume",
    });
  }
  checks.push({
    level: "info",
    what: "Branch protection",
    detail:
      "The fence that holds: a ruleset on each repository's default branch requiring a pull request, with no bypass.",
  });
  return checks;
}
