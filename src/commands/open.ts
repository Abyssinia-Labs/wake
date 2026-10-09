// `wakectl open <name>`: back into a run, by the name the app shows. Starts
// the run's tool on its session, in its folder, here in this terminal; with
// no name, lists the recent runs.
import { existsSync } from "node:fs";
import { paths } from "../config";
import type { AgentTool } from "../contract";
import { findRun, type RunRecord, readHistory } from "../history";
import { say } from "../log";
import { TOOL_NAMES } from "../tools";
import { ago, bold, cyan, dim, mark, pad, tildify } from "../ui";

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

export async function open(name: string | undefined): Promise<void> {
  const all = await readHistory(paths().history);
  if (!name) {
    say(
      [bold("Recent runs"), ...listed(all, Date.now()), "", dim("wakectl open <name>")].join("\n"),
    );
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
  const proc = Bun.spawn(args, {
    cwd: run.cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exitCode = await proc.exited;
}
