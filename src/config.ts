// Where Wake keeps things, and what it remembers between runs. Place keys
// are not here: they live in the Keychain (secrets.ts).
import { mkdir, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Agent } from "./contract";

export type PairedApp = {
  /** As the person typed it to `wakectl pair`, and the Keychain's name for its key. */
  domain: string;
  app: string;
  agent: Agent;
  convexUrl: string;
  httpBase: string;
  pairedAt: number;
  /** The name of the app's MCP server in Claude Code, when it is not the app's own. */
  mcpServer?: string;
};

export type Config = {
  /** Folders whose clones a run may use (the pattern's "What a run may do"). */
  roots: string[];
  maxRuns: number;
  runTimeoutMinutes: number;
  /** Tools a run may use beyond Wake's list, in Claude Code's syntax. */
  extraAllowedTools: string[];
  apps: Record<string, PairedApp>;
};

export type Paths = {
  home: string;
  config: string;
  state: string;
  paused: string;
  worktrees: string;
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
    apps: {},
  };
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
    // Written only by Wake, so its shape is trusted once it is an object.
    apps: apps as Record<string, PairedApp>,
  };
}

/** Written whole and renamed into place, so a listener never reads half a file. */
export async function saveConfig(config: Config): Promise<void> {
  await writeJson(paths().config, config);
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await Bun.write(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}
