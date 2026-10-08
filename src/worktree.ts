// A run works in its own worktree of the person's clone, on the branch the
// app named, so it never touches what the person has checked out. It lives
// in the clone's .claude/worktrees/, where Claude Code keeps its own, so the
// session belongs to the repository: `claude --resume` there, then Ctrl+W,
// lists it. The worktree is kept afterwards; resuming needs the same folder.
// Claude Code's own --worktree is not used: it always makes a new
// `worktree-<name>` branch, and a run must be on the ticket's branch.
import { access, appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type Exec, git, gitOk } from "./exec";

export type Prepared = { cwd: string; defaultBranch: string };

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export const WORKTREES_DIR = join(".claude", "worktrees");

export function worktreePath(clone: string, branch: string): string {
  return join(clone, WORKTREES_DIR, branch.replaceAll("/", "--"));
}

/**
 * Keeps the worktrees out of `git status` in the clone, through the clone's
 * own .git/info/exclude: local, never committed, so no repository changes.
 */
export async function excludeWorktrees(run: Exec, clone: string): Promise<void> {
  const relative = await git(run, ["rev-parse", "--git-path", "info/exclude"], clone);
  const file = relative.startsWith("/") ? relative : join(clone, relative);
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch {
    // No exclude file yet: appending makes one.
  }
  const line = "/.claude/worktrees/";
  if (text.split("\n").some((one) => one.trim() === line)) return;
  await appendFile(file, `${text === "" || text.endsWith("\n") ? "" : "\n"}${line}\n`);
}

async function defaultBranchOf(run: Exec, clone: string): Promise<string> {
  try {
    const head = await git(run, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], clone);
    return head.replace(/^origin\//, "");
  } catch {
    // A clone made without origin/HEAD (an old clone, a bare init) says main.
    return "main";
  }
}

export async function prepareWorktree(
  run: Exec,
  o: { clone: string; branch: string },
): Promise<Prepared> {
  await git(run, ["fetch", "origin", "--prune", "--quiet"], o.clone);
  await excludeWorktrees(run, o.clone);
  const defaultBranch = await defaultBranchOf(run, o.clone);
  const cwd = worktreePath(o.clone, o.branch);

  if (await exists(cwd)) {
    const current = await git(run, ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (current !== o.branch) {
      throw new Error(`${cwd} is on ${current}, not ${o.branch}; remove it with wakectl prune.`);
    }
    return { cwd, defaultBranch };
  }

  const local = await gitOk(
    run,
    ["show-ref", "--verify", "--quiet", `refs/heads/${o.branch}`],
    o.clone,
  );
  const remote = await gitOk(
    run,
    ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${o.branch}`],
    o.clone,
  );
  if (local) {
    // Work an earlier run left on this branch carries on from where it was.
    await git(run, ["worktree", "add", "--quiet", cwd, o.branch], o.clone);
  } else if (remote) {
    await git(
      run,
      ["worktree", "add", "--quiet", "--track", "-b", o.branch, cwd, `origin/${o.branch}`],
      o.clone,
    );
  } else {
    await git(
      run,
      ["worktree", "add", "--quiet", "--no-track", "-b", o.branch, cwd, `origin/${defaultBranch}`],
      o.clone,
    );
  }
  return { cwd, defaultBranch };
}
