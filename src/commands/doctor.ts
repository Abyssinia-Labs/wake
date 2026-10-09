// `wakectl doctor` and `wakectl setup`, wired to the real machine: the
// checks and the flow themselves live in doctor.ts and setup.ts.
import { existsSync } from "node:fs";
import { loadConfig, paths } from "../config";
import { machineChecks, type Probe, realProbe, wakeChecks } from "../doctor";
import { exec } from "../exec";
import { plistPath } from "../launchd";
import { say } from "../log";
import { terminalIo } from "../prompt";
import { isAlive, readState } from "../state";
import { bold } from "../ui";
import { pair } from "./pair";
import { install } from "./service";
import { checkLines, setupFlow } from "./setup";

async function probe(): Promise<Probe> {
  const p = paths();
  const state = await readState(p.state);
  return realProbe({
    plist: plistPath(),
    listener: state && isAlive(state.pid) ? state.pid : null,
    paused: existsSync(p.paused),
  });
}

export async function doctor(): Promise<void> {
  const machine = await machineChecks(exec, await probe());
  const wake = wakeChecks(await loadConfig(), await probe());
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
