// `wakectl doctor` and `wakectl setup`, wired to the real machine: the
// checks and the flow themselves live in doctor.ts and setup.ts.
import { existsSync } from "node:fs";
import { loadConfig, paths } from "../config";
import { daemonFor } from "../daemon";
import { type Check, machineChecks, type Probe, realProbe, wakeChecks } from "../doctor";
import { exec } from "../exec";
import { say } from "../log";
import { terminalIo } from "../prompt";
import { cursorChecks } from "../runners/cursor-signin";
import { isAlive, readState } from "../state";
import { toolOf } from "../tools";
import { bold } from "../ui";
import { pair } from "./pair";
import { install } from "./service";
import { checkLines, setupFlow } from "./setup";

async function probe(): Promise<Probe> {
  const p = paths();
  const state = await readState(p.state);
  return realProbe({
    plist: daemonFor()?.path ?? "",
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
