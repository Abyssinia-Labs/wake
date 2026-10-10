// Where Wake keeps things, and what it remembers between runs. Place keys
// are not here: they live in the Keychain (secrets.ts).
import { chmod, mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { type Agent, type AgentTool, isRepo, type Transport } from "./contract";

export type PairedApp = {
  /** As the person typed it to `wakectl pair`, and the Keychain's name for its key. */
  domain: string;
  app: string;
  agent: Agent;
  /** How Wake reaches its summonses; Convex when absent, as every pairing before HTTP was. */
  transport?: Transport;
  /** The Convex deployment, for the convex transport. */
  convexUrl?: string;
  httpBase: string;
  pairedAt: number;
  /** The name of the app's MCP server in the agent tool, when it is not the app's own. */
  mcpServer?: string;
  /** Which tool runs this agent (GAT-68); Claude Code when the app did not say. */
  tool?: AgentTool;
};

export type Config = {
  /** Folders whose clones a run may use (the pattern's "What a run may do"). */
  roots: string[];
  maxRuns: number;
  runTimeoutMinutes: number;
  /** Tools a run may use beyond Wake's list, in Claude Code's syntax. */
  extraAllowedTools: string[];
  /** Headless `claude -p`, or a tab in herdr to watch (falls back to headless). */
  run: RunMode;
  permissionMode: PermissionMode;
  /** Trust a Codex run's worktree in Codex's config first, so herdr runs are not asked (codex-trust.ts). */
  trustCodexWorktrees: boolean;
  /**
   * The repositories each app's domain may run in, `owner/name` in lower
   * case: a summons for any other is refused, so an app can't aim a run at
   * an unrelated clone (the security pass, 2026-10-08).
   */
  repos: Record<string, string[]>;
  apps: Record<string, PairedApp>;
};

export const RUN_MODES = ["headless", "herdr"] as const;

/**
 * The Claude Code permission modes a run may use. `acceptEdits` asks about
 * anything outside the allowed tools, which in herdr waits for the person;
 * `auto` lets Claude Code's auto mode decide; `dontAsk` denies anything not
 * allowed, so a run never waits. Never bypassPermissions (the pattern's "What
 * a run may do"); `plan` would never edit and `manual` asks about everything.
 */
export const PERMISSION_MODES = ["acceptEdits", "auto", "dontAsk"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];
export type RunMode = (typeof RUN_MODES)[number];

export type Paths = {
  home: string;
  config: string;
  state: string;
  paused: string;
  /** Where runs were made before they moved into the clone; prune still clears it. */
  worktrees: string;
  /** The list of worktrees Wake made (made.ts). */
  made: string;
  /** The repositories each app has named in a summons (asked.ts). */
  asked: string;
  /** The runs this machine made, by name, for `wakectl open` (history.ts). */
  history: string;
  rooms: string;
  log: string;
};

export function paths(): Paths {
  const override = process.env.WAKE_HOME;
  const home = override ?? join(homedir(), "Library", "Application Support", "Wake");
  return {
    home,
    config: join(home, "config.json"),
    state: join(home, "state.json"),
    paused: join(home, "paused"),
    worktrees: join(home, "worktrees"),
    made: join(home, "worktrees.json"),
    asked: join(home, "asked-repos.json"),
    history: join(home, "runs.json"),
    rooms: join(home, "rooms"),
    log: override ? join(home, "wake.log") : join(homedir(), "Library", "Logs", "Wake", "wake.log"),
  };
}

export function defaults(): Config {
  return {
    roots: [join(homedir(), "Projects")],
    maxRuns: 2,
    runTimeoutMinutes: 120,
    extraAllowedTools: [],
    run: "headless",
    permissionMode: "acceptEdits",
    trustCodexWorktrees: false,
    repos: {},
    apps: {},
  };
}

function approvedRepos(v: unknown): Record<string, string[]> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const out: Record<string, string[]> = {};
  for (const [domain, list] of Object.entries(v)) {
    // Each entry on its own: one bad line drops itself, not the app's list.
    const listed: unknown[] = Array.isArray(list) ? list : [];
    const repos = listed.filter(isRepo).map((one) => one.toLowerCase());
    if (repos.length > 0) out[domainKey(domain)] = [...new Set(repos)];
  }
  return out;
}

/** Whether `domain` may run in `repo` on this machine. */
export function repoApproved(config: Config, domain: string, repo: string): boolean {
  return config.repos[domainKey(domain)]?.includes(repo.toLowerCase()) ?? false;
}

/** The domain as the config and the Keychain name it. */
export function domainKey(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function strings(v: unknown): string[] | undefined {
  return Array.isArray(v) && v.every((s) => typeof s === "string") ? v : undefined;
}

function positive(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : undefined;
}

export async function loadConfig(): Promise<Config> {
  const file = Bun.file(paths().config);
  const base = defaults();
  if (!(await file.exists())) return base;
  const raw: unknown = await file.json();
  if (typeof raw !== "object" || raw === null) return base;
  const v = raw as Record<string, unknown>;
  const apps = typeof v.apps === "object" && v.apps !== null ? v.apps : {};
  return {
    roots: strings(v.roots) ?? base.roots,
    maxRuns: positive(v.maxRuns) ?? base.maxRuns,
    runTimeoutMinutes: positive(v.runTimeoutMinutes) ?? base.runTimeoutMinutes,
    extraAllowedTools: strings(v.extraAllowedTools) ?? base.extraAllowedTools,
    run: RUN_MODES.find((mode) => mode === v.run) ?? base.run,
    trustCodexWorktrees: v.trustCodexWorktrees === true,
    repos: approvedRepos(v.repos),
    // Anything else in the file, bypassPermissions included, is read as the default.
    permissionMode:
      PERMISSION_MODES.find((mode) => mode === v.permissionMode) ?? base.permissionMode,
    // Written only by Wake, so its shape is trusted once it is an object.
    apps: apps as Record<string, PairedApp>,
  };
}

/** Written whole and renamed into place, so a listener never reads half a file. */
export async function saveConfig(config: Config): Promise<void> {
  await writeJson(paths().config, config);
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

/**
 * Wake's own files are the person's alone: the log holds what each run did,
 * the state what is running where (the security pass). Folders 0700, files
 * 0600; made at install and at every start, so an older install catches up.
 */
export async function keepPrivate(p: Paths): Promise<void> {
  const quietly = (path: string, mode: number) => chmod(path, mode).catch(() => undefined);
  await mkdir(p.home, { recursive: true, mode: 0o700 });
  await mkdir(dirname(p.log), { recursive: true, mode: 0o700 });
  // launchd makes the log 0644 when it is missing; made here first, it is kept as is.
  await writeFile(p.log, "", { flag: "a", mode: 0o600 });
  await Promise.all([
    quietly(p.home, 0o700),
    quietly(dirname(p.log), 0o700),
    ...[p.log, p.config, p.state, p.made, p.history].map((path) => quietly(path, 0o600)),
  ]);
}
