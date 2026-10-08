// One summons, from a won claim to an outcome: find the clone, prepare the
// worktree (or a room, when there is no repository), start Claude Code.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type ClaudeResult, type ClaudeRun, runClaude } from "./claude";
import type { Config, PairedApp, Paths, RunMode } from "./config";
import type { AgentTool, Outcome, Run, Summons } from "./contract";
import type { Exec } from "./exec";
import { herdrRunning, runInHerdr } from "./herdr";
import { installDependencies } from "./install";
import { rememberWorktree } from "./made";
import { findClone } from "./repos";
import { runCodex } from "./runners/codex";
import { runCursor } from "./runners/cursor";
import { toolOf } from "./tools";
import { prepareWorktree } from "./worktree";

/** A run under way; `sessionId` is empty until a tool that picks its own has said it. */
export type Started = { sessionId: string; cwd: string; tool: AgentTool };

export type RunDeps = {
  exec: Exec;
  claude: (
    run: ClaudeRun,
    how: { mode: RunMode; ref: string; tool: AgentTool },
  ) => Promise<ClaudeResult>;
  newId: () => string;
};

export const realDeps = (exec: Exec): RunDeps => ({
  exec,
  claude: async (run, how) => {
    if (how.mode === "herdr") {
      if (await herdrRunning(exec)) return await runInHerdr({ ...run, ref: how.ref }, exec);
      run.onEvent?.("herdr is not running, so this run is headless");
    }
    // The tool that paired the agent runs it (GAT-68): Claude Code, Codex or Cursor.
    if (how.tool === "codex") return await runCodex(run);
    if (how.tool === "cursor") return await runCursor(run, exec);
    return await runClaude(run);
  },
  newId: () => crypto.randomUUID(),
});

/** The app's own prompt, with the facts Wake adds at its foot. */
export function composePrompt(run: Run, summons: Summons, sessionId: string | null): string {
  return [
    run.prompt.trim(),
    "",
    `Summons ${summons.id}: ${summons.kind}, ${summons.target.ref} (${summons.target.url}).`,
    ...(sessionId ? [`Session ${sessionId}.`] : []),
  ].join("\n");
}

export async function runSummons(
  summons: Summons,
  run: Run,
  app: PairedApp,
  o: {
    config: Config;
    paths: Paths;
    deps: RunDeps;
    onStart: (s: Started) => void;
    /** Each step of the run, for the listener's log. */
    onEvent?: (line: string) => void;
  },
): Promise<Outcome> {
  const sessionId = o.deps.newId();
  let cwd: string;
  let defaultBranch: string | undefined;

  if (summons.repo && summons.branch) {
    const clone = await findClone(o.deps.exec, summons.repo, o.config.roots);
    if (!clone) {
      return {
        id: summons.id,
        outcome: "failed",
        // The folders searched stay on this machine; the reason goes to the app.
        reason: `No clone of ${summons.repo} in the folders Wake looks in (wakectl status).`,
      };
    }
    const prepared = await prepareWorktree(o.deps.exec, { clone, branch: summons.branch });
    cwd = prepared.cwd;
    await rememberWorktree(o.paths.made, cwd);
    await installDependencies(o.deps.exec, cwd, (line) => o.onEvent?.(line));
    defaultBranch = prepared.defaultBranch;
  } else {
    // No repository: an empty folder per app, with the app's tools only.
    cwd = join(o.paths.rooms, app.app);
    await mkdir(cwd, { recursive: true });
  }

  // The listener only connects a pairing with a tool, so this is never the fallback.
  const tool = toolOf(app) ?? "claude";
  // Claude Code takes Wake's session id; Codex and Cursor pick their own and say it.
  const ours = tool === "claude";
  o.onStart({ sessionId: ours ? sessionId : "", cwd, tool });
  const result = await o.deps.claude(
    {
      cwd,
      sessionId,
      tool,
      onSession: (id) => o.onStart({ sessionId: id, cwd, tool }),
      prompt: composePrompt(run, summons, ours ? sessionId : null),
      mcpServer: app.mcpServer ?? app.app,
      defaultBranch,
      extraAllowedTools: o.config.extraAllowedTools,
      timeoutMs: o.config.runTimeoutMinutes * 60_000,
      name: `${summons.target.ref} · Wake`,
      permissionMode: o.config.permissionMode,
      ...(o.onEvent ? { onEvent: o.onEvent } : {}),
    },
    { mode: o.config.run, ref: summons.target.ref, tool },
  );
  return result.ok
    ? { id: summons.id, outcome: "done" }
    : { id: summons.id, outcome: "failed", reason: result.reason };
}
