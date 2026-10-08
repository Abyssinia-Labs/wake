// A fresh worktree has no node_modules, so a run's typecheck failed on a
// package its tests never touched (GAT-20, 2026-10-08). Where the repository
// is a Bun one, Wake installs from its lockfile before the agent starts;
// anything else is left to the agent. A failed install is said, not fatal.
import { access } from "node:fs/promises";
import { join } from "node:path";
import type { Exec } from "./exec";

async function has(cwd: string, file: string): Promise<boolean> {
  try {
    await access(join(cwd, file));
    return true;
  } catch {
    return false;
  }
}

/** True when it installed; a line for the log either way. */
export async function installDependencies(
  run: Exec,
  cwd: string,
  say: (line: string) => void,
): Promise<boolean> {
  if (!(await has(cwd, "bun.lock")) && !(await has(cwd, "bun.lockb"))) return false;
  if (await has(cwd, "node_modules")) return false;
  const result = await run(["bun", "install", "--frozen-lockfile"], { cwd });
  if (result.code === 0) {
    say("installed dependencies (bun install --frozen-lockfile)");
    return true;
  }
  const why = result.stderr.trim().split("\n").at(-1) ?? "";
  say(`bun install failed${why ? `: ${why}` : ""}; the agent will have to install`);
  return false;
}
