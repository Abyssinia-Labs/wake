// `wakectl setup`: everything a first run needs, asked in order, so nobody
// digs through config files. What it changes is the same config the single
// commands change; run it again any time to revisit an answer.
import { homedir } from "node:os";
import { join } from "node:path";
import { readAsked } from "../asked";
import {
  type Config,
  loadConfig,
  PERMISSION_MODES,
  type PermissionMode,
  paths,
  saveConfig,
} from "../config";
import { type Check, type Level, machineChecks, type Probe, wakeChecks } from "../doctor";
import type { Exec } from "../exec";
import { choose, chooseMany, confirm, type Io, type Option, text } from "../prompt";
import { listClones } from "../repos";
import { bold, cyan, dim, mark, tildify } from "../ui";
import { MEANS } from "./settings";

export type SetupDeps = {
  io: Io;
  run: Exec;
  probe: () => Promise<Probe>;
  pair: (domain: string, code: string, tool?: string) => Promise<void>;
  install: () => Promise<void>;
  /** Where the listener records the repositories each app asked for; the real one when absent. */
  askedPath?: string;
  home?: string;
};

const ICON: Record<Level, () => string> = {
  ok: mark.ok,
  warn: mark.warn,
  fail: mark.fail,
  info: () => dim("·"),
};

export function checkLines(checks: Check[]): string[] {
  return checks.flatMap((check) => [
    `  ${ICON[check.level]()} ${check.what}${check.detail ? dim(`  ${check.detail}`) : ""}`,
    ...(check.fix ? [`      ${dim("fix:")} ${cyan(check.fix)}`] : []),
  ]);
}

const FOLDERS = [
  "Projects",
  "Developer",
  "code",
  "src",
  "dev",
  "repos",
  "workspace",
  "github",
  "git",
];

/** `wakectl pair gatherd.dev K7QD-2M9X --tool codex`, as an agent prints it, or just its words. */
export function readPairLine(line: string): { domain: string; code: string; tool?: string } | null {
  const match = line
    .trim()
    .match(
      /^(?:wakectl\s+pair\s+)?(\S+)\s+([A-Za-z0-9]{4}-?[A-Za-z0-9]{4})(?:\s+--tool[=\s]+(\w+))?$/,
    );
  if (!match?.[1] || !match[2]) return null;
  return { domain: match[1], code: match[2], ...(match[3] ? { tool: match[3] } : {}) };
}

async function folders(d: SetupDeps, config: Config, probe: Probe): Promise<Config> {
  const home = d.home ?? homedir();
  const candidates = [
    ...new Set([...config.roots, ...FOLDERS.map((name) => join(home, name))]),
  ].filter((path) => probe.exists(path));
  if (candidates.length === 0) {
    const typed = await text(d.io, "Which folder holds your clones? (a full path)");
    return typed ? { ...config, roots: [typed] } : config;
  }
  const roots = await chooseMany(
    d.io,
    "Where are your clones? Wake looks one and two folders down.",
    candidates.map((path) => ({ value: path, label: tildify(path, home) })),
    config.roots.filter((root) => candidates.includes(root)),
  );
  return roots.length > 0 ? { ...config, roots } : config;
}

async function pairing(d: SetupDeps): Promise<void> {
  const config = await loadConfig();
  const paired = Object.values(config.apps);
  if (paired.length > 0) {
    d.io.say(bold("Paired"));
    for (const app of paired) d.io.say(`  ${mark.ok()} ${app.agent.name} on ${app.domain}`);
    if (!(await confirm(d.io, "Pair another agent?", false))) return;
  } else {
    d.io.say(bold("Pair your agent"));
    d.io.say(
      dim(
        "  In Claude Code, Codex or Cursor, with the app's MCP server connected, ask:\n  “Pair Wake with this machine.” It answers with a wakectl pair command.",
      ),
    );
  }
  for (;;) {
    const line = await text(d.io, "Paste the command (or Enter to skip):");
    if (!line) return;
    const read = readPairLine(line);
    if (!read) {
      d.io.say(
        `${mark.warn()} That isn't a pair command. It looks like ${cyan("wakectl pair app.example.com K7QD-2M9X")}`,
      );
      continue;
    }
    try {
      await d.pair(read.domain, read.code, read.tool);
      return;
    } catch (error) {
      d.io.say(`${mark.fail()} ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function repositories(d: SetupDeps, config: Config): Promise<Config> {
  const domains = [...new Set(Object.values(config.apps).map((app) => app.domain))];
  if (domains.length === 0) return config;
  const clones = await listClones(d.run, config.roots);
  if (clones.length === 0) {
    d.io.say(
      `${mark.warn()} No GitHub clones under ${config.roots.map((root) => tildify(root)).join(", ")}.`,
    );
    return config;
  }
  const repos = { ...config.repos };
  const asked = await readAsked(d.askedPath ?? paths().asked);
  for (const domain of domains) {
    const options = repoOptions(clones, asked[domain] ?? []);
    const chosen = await chooseRepos(d, domain, options, repos[domain] ?? []);
    if (chosen.length > 0) repos[domain] = chosen;
    else delete repos[domain];
  }
  return { ...config, repos };
}

/** More than this at once is confirmed: an approval is a fence, and "all" opened every clone. */
export const MANY_REPOS = 10;

/** The clones, the ones the app has asked for first and saying so. */
export function repoOptions(
  clones: { repo: string; path: string }[],
  asked: readonly string[],
): Option<string>[] {
  const wanted = new Set(asked);
  const option = (clone: { repo: string; path: string }, note: string): Option<string> => ({
    value: clone.repo,
    label: clone.repo,
    hint: `${tildify(clone.path)}${note}`,
  });
  return [
    ...clones.filter((c) => wanted.has(c.repo)).map((c) => option(c, " · asked for before")),
    ...clones.filter((c) => !wanted.has(c.repo)).map((c) => option(c, "")),
  ];
}

async function chooseRepos(
  d: SetupDeps,
  domain: string,
  options: Option<string>[],
  approved: string[],
): Promise<string[]> {
  for (;;) {
    const chosen = await chooseMany(
      d.io,
      `Which repositories may ${domain} run in on this machine? ${dim("Only what it should work in.")}`,
      options,
      approved,
    );
    if (chosen.length <= MANY_REPOS) return chosen;
    const sure = await confirm(
      d.io,
      `Approve all ${chosen.length}? ${domain} could then start an agent in any of them.`,
      false,
    );
    if (sure) return chosen;
  }
}

async function howRunsWork(d: SetupDeps, config: Config, herdr: boolean): Promise<Config> {
  let next = config;
  if (herdr) {
    const run = await choose(
      d.io,
      "Where should runs open?",
      [
        {
          value: "herdr",
          label: "A tab in herdr",
          hint: "watch it, step in, answer its questions",
        },
        { value: "headless", label: "In the background", hint: "follow with wakectl logs -f" },
      ],
      config.run === "headless" ? 1 : 0,
    );
    next = { ...next, run };
  }
  const permissionMode = await choose<PermissionMode>(
    d.io,
    "What may a run do without asking?",
    PERMISSION_MODES.map((mode) => ({ value: mode, label: mode, hint: MEANS[mode] })),
    PERMISSION_MODES.indexOf(config.permissionMode),
  );
  return { ...next, permissionMode };
}

export async function setupFlow(d: SetupDeps): Promise<void> {
  d.io.say(
    `${bold("Wake setup")} ${dim("· every answer can be changed later, here or with its own command")}\n`,
  );
  let probe = await d.probe();
  const machine = await machineChecks(d.run, probe);
  d.io.say(bold("This machine"));
  for (const line of checkLines(machine)) d.io.say(line);
  if (machine.some((check) => check.level === "fail")) {
    d.io.say(`\n${mark.fail()} Fix what's marked, then run ${cyan("wakectl setup")} again.`);
    return;
  }
  d.io.say("");
  await saveConfig(await folders(d, await loadConfig(), probe));
  d.io.say("");
  await pairing(d);
  d.io.say("");
  let config = await repositories(d, await loadConfig());
  const herdr = machine.some((check) => check.what === "herdr");
  config = await howRunsWork(d, config, herdr);
  await saveConfig(config);
  d.io.say("");
  if (!probe.exists(probe.plist)) {
    if (await confirm(d.io, "Start listening now and at every login?")) await d.install();
  } else {
    d.io.say(dim("The listener reads these answers within half a minute."));
  }
  probe = await d.probe();
  d.io.say(`\n${bold("Where things stand")}`);
  for (const line of checkLines(wakeChecks(await loadConfig(), probe))) d.io.say(line);
}
