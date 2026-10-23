// `wakectl doctor` and `wakectl setup`, wired to the real machine: the
// checks and the flow themselves live in doctor.ts and setup.ts.
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { readAsked } from "../asked";
import { loadConfig, paths } from "../config";
import type { AgentTool } from "../contract";
import { daemonFor } from "../daemon";
import { type Check, machineChecks, type Probe, realProbe, wakeChecks } from "../doctor";
import { exec } from "../exec";
import { say } from "../log";
import { type Listed, modelChoices } from "../models";
import { terminalIo } from "../prompt";
import { listClones } from "../repos";
import { cursorChecks } from "../runners/cursor-signin";
import { type SetupJson, setupJson } from "../setup-json";
import { isAlive, readState } from "../state";
import { pairedTools, toolOf } from "../tools";
import { bold } from "../ui";
import { pair } from "./pair";
import { install } from "./service";
import { checkLines, folderCandidates, setupFlow } from "./setup";

async function probe(): Promise<Probe> {
  const p = paths();
  const state = await readState(p.state);
  const daemon = daemonFor();
  return realProbe({
    plist: daemon?.path ?? "",
    appAgent: (await daemon?.appAgent(exec)) ?? null,
    listener: state && isAlive(state.pid) ? state.pid : null,
    paused: existsSync(p.paused),
  });
}

/** The machine's checks and Wake's, for `wakectl doctor` and its `--json`. */
export async function doctorChecks(): Promise<{ machine: Check[]; wake: Check[] }> {
  const config = await loadConfig();
  const machine = await machineChecks(exec, await probe());
  // The MCP server each Cursor pairing's runs read the app through (WAK-14).
  const cursorServers = Object.values(config.apps)
    .filter((app) => toolOf(app) === "cursor")
    .map((app) => app.mcpServer ?? app.app);
  const wake = [
    ...wakeChecks(config, await probe()),
    ...(await cursorChecks([...new Set(cursorServers)])),
  ];
  return { machine, wake };
}

/** What setup would ask, read as setup reads it, for `wakectl setup --json`. */
export async function setupNow(): Promise<SetupJson> {
  const config = await loadConfig();
  const found = await probe();
  const choices: Partial<Record<AgentTool, Listed[]>> = {};
  for (const tool of pairedTools(config)) choices[tool] = await modelChoices(tool, exec);
  return setupJson({
    machine: await machineChecks(exec, found),
    config,
    folders: folderCandidates(config, homedir(), found.exists),
    clones: await listClones(exec, config.roots),
    asked: await readAsked(paths().asked),
    choices,
    listener: found.appAgent ? "app" : found.exists(found.plist) ? "wake" : "none",
  });
}

export async function doctor(): Promise<void> {
  const { machine, wake } = await doctorChecks();
  say(
    [bold("This machine"), ...checkLines(machine), "", bold("Wake"), ...checkLines(wake)].join(
      "\n",
    ),
  );
}

export async function setup(): Promise<void> {
  if (!process.stdin.isTTY)
    throw new Error("wakectl setup asks questions, so it needs a terminal.");
  const io = terminalIo();
  try {
    await setupFlow({ io, run: exec, probe, pair, install });
  } finally {
    io.close();
  }
}
