// `wakectl prune`: remove run worktrees untouched for a while. A worktree
// with uncommitted work is kept and named, never forced.
import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { paths } from "../config";
import { exec, git } from "../exec";
import { messageOf, say } from "../log";
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

  for (const repo of await dirs(p.worktrees)) {
    for (const worktree of await dirs(repo)) {
      if (inUse.has(worktree) || (await stat(worktree)).mtimeMs > cutoff) continue;
      try {
        const common = await git(
          exec,
          ["rev-parse", "--path-format=absolute", "--git-common-dir"],
          worktree,
        );
        // Without --force, git refuses a worktree with changes, which is the point.
        await git(exec, ["worktree", "remove", worktree], dirname(common));
        removed += 1;
      } catch (error) {
        say(`Kept ${worktree}: ${messageOf(error)}`);
      }
    }
  }
  say(`Removed ${removed} worktree${removed === 1 ? "" : "s"} older than ${days} days.`);
}
