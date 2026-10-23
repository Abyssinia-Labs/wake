// `wakectl open <name>`: back into a run, by the name the app shows. A run
// that has ended is started again on its session, in its folder, here in
// this terminal. One still going is never started twice, since a second
// process on its session would fight the first: in herdr its tab is brought
// to the front and herdr shown here; headless, it is left to finish. With no
// name, lists the recent runs.
import { existsSync } from "node:fs";
import { paths } from "../config";
import type { AgentTool } from "../contract";
import { type Exec, exec } from "../exec";
import { focusTab, runTabLabel } from "../herdr-tab";
import { findRun, type RunRecord, readHistory } from "../history";
import { say } from "../log";
import { isAlive, type RunState, readState } from "../state";
import { findRunning } from "../stop";
import { TOOL_NAMES } from "../tools";
import { ago, bold, cyan, dim, mark, pad, tildify } from "../ui";

export type OpenDeps = {
  exec: Exec;
  /** Starts a program on this terminal, in that folder, and says its exit code. */
  attach: (args: string[], cwd?: string) => Promise<number>;
  /** This terminal is a pane in herdr already (herdr sets HERDR_ENV=1 in its panes). */
  inHerdr: boolean;
};

const realDeps = (): OpenDeps => ({
  exec,
  attach: (args, cwd) =>
    Bun.spawn(args, { cwd, stdin: "inherit", stdout: "inherit", stderr: "inherit" }).exited,
  inHerdr: process.env.HERDR_ENV === "1",
});

/** The tool's own resume, as arguments: the same commands as `resumeLine`. */
export function resumeArgs(tool: AgentTool, sessionId: string): string[] {
  if (tool === "codex") return ["codex", "resume", sessionId];
  if (tool === "cursor") return ["cursor-agent", "--resume", sessionId];
  return ["claude", "--resume", sessionId];
}

function listed(all: readonly RunRecord[], now: number): string[] {
  if (all.length === 0) return [dim("No runs yet.")];
  return [...all]
    .reverse()
    .slice(0, 15)
    .map((run) => {
      const how = run.outcome === "failed" ? mark.fail() : run.outcome ? mark.ok() : mark.half();
      return `  ${how} ${pad(bold(run.name), 18)}${pad(run.ref, 14)}${pad(run.app, 12)}${dim(ago(run.startedAt, now))}`;
    });
}

/** The run by that name going now, if the listener that started it still runs. */
async function goingRun(wanted: string): Promise<RunState | undefined> {
  const state = await readState(paths().state);
  return state && isAlive(state.pid) ? findRunning(state.runs, wanted) : undefined;
}

/** A run still going: shown in its herdr tab, or refused; never a second process. */
export async function openGoing(run: RunState, deps: OpenDeps): Promise<number> {
  const label = run.name ?? run.ref;
  const stopLine = cyan(`wakectl stop ${label}`);
  // An older listener didn't say where its run is, so it is taken as headless.
  if (!run.herdr || !run.name) {
    throw new Error(
      `${label} is still going${run.herdr === false ? " headless" : ""}, so it can't be opened until it ends: a second ${TOOL_NAMES[run.tool ?? "claude"]} on its session would fight the first. ${stopLine} ends it.`,
    );
  }
  const tabName = runTabLabel(run.ref, run.name);
  const tab = await focusTab(deps.exec, tabName);
  if (!tab) {
    throw new Error(
      `${label} is still going in herdr, but no tab there is called ${tabName}: it was closed or renamed. ${stopLine} ends the run.`,
    );
  }
  say(`${mark.ok()} ${bold(label)}, ${run.ref}: ${dim("its tab in herdr")}`);
  // In a herdr pane, the tab is in front now; herdr inside herdr would be one too many.
  if (deps.inHerdr) return 0;
  return await deps.attach(["herdr"]);
}

export async function open(name: string | undefined, deps: OpenDeps = realDeps()): Promise<void> {
  const all = await readHistory(paths().history);
  if (!name) {
    say(
      [bold("Recent runs"), ...listed(all, Date.now()), "", dim("wakectl open <name>")].join("\n"),
    );
    return;
  }
  const going = await goingRun(name);
  if (going) {
    process.exitCode = await openGoing(going, deps);
    return;
  }
  const run = findRun(all, name);
  if (!run) throw new Error(`No run here is called ${name}. wakectl open lists the recent ones.`);
  if (!run.sessionId) {
    throw new Error(
      `${TOOL_NAMES[run.tool]} never said ${run.name}'s session, so it can't be reopened.`,
    );
  }
  if (!existsSync(run.cwd)) {
    throw new Error(
      `${run.name}'s folder is gone (${tildify(run.cwd)}); wakectl prune may have removed it.`,
    );
  }
  const args = resumeArgs(run.tool, run.sessionId);
  say(
    `${mark.ok()} ${bold(run.name)}, ${run.ref}: ${cyan(args.join(" "))} ${dim(`in ${tildify(run.cwd)}`)}`,
  );
  process.exitCode = await deps.attach(args, run.cwd);
}
