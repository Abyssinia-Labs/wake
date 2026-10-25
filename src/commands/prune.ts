// `wakectl prune`: the listener's tidy of run worktrees (tidy.ts), now, and
// saying what it kept for holding work. `--days` is how long a pushed,
// unmerged worktree is kept idle. Worktrees left where runs used to be made
// go when untouched that long. Nothing is forced: git refuses a worktree
// with changes, and one Wake did not make is never touched.
import { readdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { untrustCodexFolder } from "../codex-trust";
import { paths } from "../config";
import { exec, git } from "../exec";
import { agentName, agentOpen } from "../herdr";
import { readHistory } from "../history";
import { messageOf, say } from "../log";
import { isAlive, readState } from "../state";
import { tidyWorktrees } from "../tidy";
import { dim, mark, tildify } from "../ui";

async function dirs(path: string): Promise<string[]> {
  try {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => join(path, e.name));
  } catch {
    return [];
  }
}

/** Worktrees made where runs used to be, untouched for `days`. */
async function pruneLegacy(
  root: string,
  inUse: ReadonlySet<string>,
  days: number,
): Promise<number> {
  const cutoff = Date.now() - days * 24 * 60 * 60_000;
  let removed = 0;
  for (const repo of await dirs(root)) {
    for (const worktree of await dirs(repo)) {
      if (inUse.has(worktree) || (await stat(worktree)).mtimeMs > cutoff) continue;
      try {
        const common = await git(
          exec,
          ["rev-parse", "--path-format=absolute", "--git-common-dir"],
          worktree,
        );
        await git(exec, ["worktree", "remove", worktree], dirname(common));
        await untrustCodexFolder(worktree);
        removed += 1;
      } catch (error) {
        say(`${mark.warn()} Kept ${tildify(worktree)} ${dim(messageOf(error))}`);
      }
    }
  }
  return removed;
}

export async function prune(days: number): Promise<void> {
  const p = paths();
  const state = await readState(p.state);
  const inUse = new Set(state && isAlive(state.pid) ? state.runs.map((r) => r.cwd) : []);
  const tidied = await tidyWorktrees(
    { paths: p, history: await readHistory(p.history), inUse, idleDays: days },
    {
      exec,
      now: Date.now(),
      herdrOpen: (run) => agentOpen(exec, agentName(run.ref, run.sessionId)),
    },
  );
  for (const { path, why } of tidied.removed)
    say(`${mark.ok()} Removed ${tildify(path)} ${dim(why)}`);
  for (const { path, why } of tidied.kept) say(`${mark.warn()} Kept ${tildify(path)} ${dim(why)}`);
  const removed = tidied.removed.length + (await pruneLegacy(p.worktrees, inUse, days));
  say(
    `${mark.ok()} Removed ${removed} worktree${removed === 1 ? "" : "s"} ${dim(`merged a day ago, or pushed and untouched for ${days} days`)}`,
  );
}
