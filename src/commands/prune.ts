// `wakectl prune`: remove run worktrees untouched for a while: the ones Wake
// made (made.ts), in the clones' .claude/worktrees/, and any left where runs
// used to be made. A worktree with uncommitted work is kept and named, never
// forced, and one Wake did not make is never touched.
import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { paths } from "../config";
import { exec, git } from "../exec";
import { messageOf, say } from "../log";
import { forgetWorktree, madeWorktrees } from "../made";
import { isAlive, readState } from "../state";

async function dirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => join(path, e.name));
  } catch {
    return [];
  }
}

export async function prune(days: number): Promise<void> {
  const p = paths();
  const state = await readState(p.state);
  const inUse = new Set(state && isAlive(state.pid) ? state.runs.map((r) => r.cwd) : []);
  const cutoff = Date.now() - days * 24 * 60 * 60_000;
  let removed = 0;

  const legacy: string[] = [];
  for (const repo of await dirs(p.worktrees)) legacy.push(...(await dirs(repo)));
  for (const worktree of [...(await madeWorktrees(p.made)), ...legacy]) {
    let modified: number;
    try {
      modified = (await stat(worktree)).mtimeMs;
    } catch {
      // Already gone, by hand or by git: nothing to remove, nothing to remember.
      await forgetWorktree(p.made, worktree);
      continue;
    }
    if (inUse.has(worktree) || modified > cutoff) continue;
    try {
      const common = await git(
        exec,
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        worktree,
      );
      // Without --force, git refuses a worktree with changes, which is the point.
      await git(exec, ["worktree", "remove", worktree], dirname(common));
      await forgetWorktree(p.made, worktree);
      removed += 1;
    } catch (error) {
      say(`Kept ${worktree}: ${messageOf(error)}`);
    }
  }
  say(`Removed ${removed} worktree${removed === 1 ? "" : "s"} older than ${days} days.`);
}
