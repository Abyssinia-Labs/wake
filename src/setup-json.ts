// `wakectl setup --json`: what setup would ask, with today's answers, for a
// program that asks it its own way (Wake for Mac's setup). It changes
// nothing. Each answer goes back through its own command: `roots`, `pair`,
// `repos allow`, `mode`, `permissions`, `model` and `install`. Pure, so it
// is tested without the machine.
import { MEANS } from "./commands/settings";
import { MANY_REPOS } from "./commands/setup";
import { type Config, PERMISSION_MODES, type PermissionMode, type RunMode } from "./config";
import type { AgentTool } from "./contract";
import type { Check } from "./doctor";
import { effortChoices, type Listed, type ToolModel } from "./models";
import { pairedTools } from "./tools";

export type SetupJson = {
  /** This machine's checks, setup's first step. */
  machine: Check[];
  /** One of them failed: setup stops there until it is fixed. */
  blocked: boolean;
  /** The folders setup offers for clones, and whether Wake looks in each. */
  folders: { path: string; chosen: boolean }[];
  /** Each paired app, by domain, with the agents paired on it. */
  apps: { domain: string; agents: string[] }[];
  /** GitHub clones in the chosen folders, with the apps that have asked for each. */
  clones: { repo: string; path: string; askedBy: string[] }[];
  /** The repositories each app may run in. */
  repos: Record<string, string[]>;
  /** More than this approved at once is confirmed first. */
  manyRepos: number;
  /** herdr is installed, so runs may open in it. */
  herdr: boolean;
  run: RunMode;
  permissionMode: PermissionMode;
  permissionModes: { mode: PermissionMode; means: string }[];
  /** Each tool a pairing runs on: its choice now, its tool's list, and the efforts for a model the list lacks. */
  models: { tool: AgentTool; now: ToolModel; choices: Listed[]; efforts: string[] }[];
  /** What starts the listener at login: Wake's own LaunchAgent or service, an app, or nothing yet. */
  listener: "wake" | "app" | "none";
};

export function setupJson(input: {
  machine: Check[];
  config: Config;
  folders: string[];
  clones: { repo: string; path: string }[];
  asked: Record<string, readonly string[]>;
  choices: Partial<Record<AgentTool, Listed[]>>;
  listener: SetupJson["listener"];
}): SetupJson {
  const { machine, config, asked } = input;
  const apps = new Map<string, string[]>();
  for (const app of Object.values(config.apps)) {
    apps.set(app.domain, [...(apps.get(app.domain) ?? []), app.agent.name]);
  }
  return {
    machine,
    blocked: machine.some((check) => check.level === "fail"),
    folders: input.folders.map((path) => ({ path, chosen: config.roots.includes(path) })),
    apps: [...apps].map(([domain, agents]) => ({ domain, agents })),
    clones: input.clones.map((clone) => ({
      ...clone,
      askedBy: Object.keys(asked).filter((domain) => asked[domain]?.includes(clone.repo)),
    })),
    repos: config.repos,
    manyRepos: MANY_REPOS,
    // As setup decides it: the machine's checks name herdr when it is installed.
    herdr: machine.some((check) => check.what === "herdr"),
    run: config.run,
    permissionMode: config.permissionMode,
    permissionModes: PERMISSION_MODES.map((mode) => ({ mode, means: MEANS[mode] })),
    models: pairedTools(config).map((tool) => ({
      tool,
      now: config.models[tool] ?? {},
      choices: input.choices[tool] ?? [],
      efforts: effortChoices(tool, undefined),
    })),
    listener: input.listener,
  };
}
