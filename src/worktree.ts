// A run works in its own worktree of the person's clone, on the branch the
// app named, so it never touches what the person has checked out. The
// worktree is kept afterwards: `claude --resume` needs the same folder.
import { access } from "node:fs/promises";
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

export function worktreePath(root: string, repo: string, branch: string): string {
  return join(root, repo.replace("/", "--"), branch.replaceAll("/", "--"));
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
  o: { clone: string; repo: string; branch: string; root: string },
): Promise<Prepared> {
  await git(run, ["fetch", "origin", "--prune", "--quiet"], o.clone);
  const defaultBranch = await defaultBranchOf(run, o.clone);
  const cwd = worktreePath(o.root, o.repo, o.branch);

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
