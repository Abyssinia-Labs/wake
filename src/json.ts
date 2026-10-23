// `--json`: what status, repos, model, doctor and open print, as objects for
// a program that drives wakectl. Pure, so tested without a listener. Names
// follow the config and the state file; nothing here carries a key, and a
// field keeps its meaning or gets a new name.
import type { Config, PermissionMode, RunMode } from "./config";
import { AGENT_TOOLS, type Agent, type AgentTool, type Transport } from "./contract";
import type { Check } from "./doctor";
import type { RunRecord } from "./history";
import type { ToolModel } from "./models";
import type { ListenerState } from "./state";
import { resumeLine, toolOf } from "./tools";

/** How the listener is doing with one pairing, as `wakectl status` words it. */
export type Connection = "listening" | "connecting" | "not-connected" | "refused" | "tool-missing";

export type AppJson = {
  /** The config's key for the pairing: its domain, or domain and agent (pair.ts). */
  key: string;
  domain: string;
  app: string;
  agent: Agent;
  /** Which tool runs it; null when neither the app nor `--tool` said. */
  tool: AgentTool | null;
  transport: Transport;
  pairedAt: number;
  connection: Connection;
  /** With `tool-missing`: the program that isn't installed, or "no tool" when none here runs it. */
  missing?: string;
};

export type RunJson = {
  app: string;
  ref: string;
  /** Its two-word name; null in a state file older than names. */
  name: string | null;
  tool: AgentTool;
  /** Null until the tool has said it. */
  sessionId: string | null;
  cwd: string;
  startedAt: number;
  /** The command that resumes it, once it has a session. */
  resume: string | null;
};

export type StatusJson = {
  listener: { running: true; pid: number; startedAt: number } | { running: false };
  paused: boolean;
  apps: AppJson[];
  repos: Record<string, string[]>;
  runs: RunJson[];
  settings: {
    run: RunMode;
    permissionMode: PermissionMode;
    models: Record<AgentTool, ToolModel>;
    extraAllowedTools: string[];
    roots: string[];
    maxRuns: number;
    runTimeoutMinutes: number;
    trustCodexWorktrees: boolean;
  };
};

export type HistoryJson = RunRecord & { resume: string | null };

function connectionOf(live: ListenerState["apps"][string] | undefined): Connection {
  if (!live) return "not-connected";
  if (live.missing) return "tool-missing";
  if (live.unpaired) return "refused";
  return live.connected ? "listening" : "connecting";
}

/** Every tool, with `{}` where it runs on its own default (`wakectl model`). */
export function modelsJson(config: Pick<Config, "models">): Record<AgentTool, ToolModel> {
  const all = {} as Record<AgentTool, ToolModel>;
  for (const tool of AGENT_TOOLS) all[tool] = config.models[tool] ?? {};
  return all;
}

export function statusJson(input: {
  config: Config;
  /** The listener's state when it is running, else null. */
  state: ListenerState | null;
  paused: boolean;
}): StatusJson {
  const { config, state, paused } = input;
  const apps = Object.entries(config.apps).map(([key, app]): AppJson => {
    const live = state?.apps[key];
    return {
      key,
      domain: app.domain,
      app: app.app,
      agent: app.agent,
      tool: toolOf(app),
      transport: app.transport ?? "convex",
      pairedAt: app.pairedAt,
      connection: connectionOf(live),
      ...(live?.missing ? { missing: live.missing } : {}),
    };
  });
  const runs = (state?.runs ?? []).map((run): RunJson => {
    const tool = run.tool ?? "claude";
    return {
      app: run.app,
      ref: run.ref,
      name: run.name ?? null,
      tool,
      sessionId: run.sessionId || null,
      cwd: run.cwd,
      startedAt: run.startedAt,
      resume: run.sessionId ? resumeLine(tool, run.sessionId) : null,
    };
  });
  return {
    listener: state
      ? { running: true, pid: state.pid, startedAt: state.startedAt }
      : { running: false },
    paused,
    apps,
    repos: config.repos,
    runs,
    settings: {
      run: config.run,
      permissionMode: config.permissionMode,
      models: modelsJson(config),
      extraAllowedTools: config.extraAllowedTools,
      roots: config.roots,
      maxRuns: config.maxRuns,
      runTimeoutMinutes: config.runTimeoutMinutes,
      trustCodexWorktrees: config.trustCodexWorktrees,
    },
  };
}

/** `wakectl open`'s list: every run this machine remembers, newest first. */
export function historyJson(all: readonly RunRecord[]): HistoryJson[] {
  return [...all]
    .reverse()
    .map((run) => ({ ...run, resume: run.sessionId ? resumeLine(run.tool, run.sessionId) : null }));
}

export function doctorJson(machine: Check[], wake: Check[]): { machine: Check[]; wake: Check[] } {
  return { machine, wake };
}
