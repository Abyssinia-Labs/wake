// A run works in its own worktree of the person's clone, on the branch the
// app named, so it never touches what the person has checked out. It lives
// where the run's tool keeps its own worktrees (`worktreeRoot`), so the tool
// lists the session as one of its own. The worktree is kept afterwards;
// resuming needs the same folder.
// Claude Code's own --worktree is not used: it always makes a new
// `worktree-<name>` branch, and a run must be on the ticket's branch.
import { access, appendFile, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { AgentTool } from "./contract";
import { Shareable } from "./errors";
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

// `worktree add` runs the clone's post-checkout hook, which a repository with
// a committed hooks folder (husky) controls: Wake starts the agent, not that.
const NO_HOOKS = ["-c", "core.hooksPath=/dev/null"];

/**
 * Where each tool keeps its worktrees, so a run's sits with the tool's own:
 * Claude Code's in the clone's .claude/worktrees (its /resume lists them),
 * Cursor's in ~/.cursor/worktrees/<repo>, Codex's in a `wake` folder of its
 * worktrees root, apart from the ones the Codex app manages and prunes.
 */
export function worktreeRoot(tool: AgentTool, clone: string, home: string = homedir()): string {
  const repo = basename(clone);
  switch (tool) {
    case "codex":
      return join(process.env.CODEX_HOME ?? join(home, ".codex"), "worktrees", "wake", repo);
    case "cursor":
      return join(home, ".cursor", "worktrees", repo);
    default:
      return join(clone, WORKTREES_DIR);
  }
}

export function worktreePath(root: string, branch: string): string {
  return join(root, branch.replaceAll("/", "--"));
}

async function sameFolder(a: string, b: string): Promise<boolean> {
  try {
    return (await realpath(a)) === (await realpath(b));
  } catch {
    return a === b;
  }
}

/** Where `branch` is already checked out, in any worktree of the clone, if anywhere. */
export async function checkedOutAt(
  run: Exec,
  clone: string,
  branch: string,
): Promise<string | null> {
  const listed = await git(run, ["worktree", "list", "--porcelain"], clone);
  // One block per worktree. A folder deleted by hand stays listed, marked
  // prunable, until git prunes it; carrying on there would start the agent
  // in a folder that is not there.
  for (const block of listed.split("\n\n")) {
    const lines = block.split("\n");
    const path = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    if (!path || !lines.includes(`branch refs/heads/${branch}`)) continue;
    if (lines.some((line) => line.startsWith("prunable")) || !(await exists(path))) continue;
    return path;
  }
  return null;
}

/**
 * Keeps a path out of `git status` in the clone, through the clone's own
 * .git/info/exclude: local, never committed, so no repository changes. It
 * only ever hides untracked files; a tracked one is unaffected.
 */
export async function excludeFromGit(run: Exec, repo: string, line: string): Promise<void> {
  const relative = await git(run, ["rev-parse", "--git-path", "info/exclude"], repo);
  const file = relative.startsWith("/") ? relative : join(repo, relative);
  let text = "";
  try {
    text = await readFile(file, "utf8");
  } catch {
    // No exclude file yet: appending makes one.
  }
  if (text.split("\n").some((one) => one.trim() === line)) return;
  await appendFile(file, `${text === "" || text.endsWith("\n") ? "" : "\n"}${line}\n`);
}

export async function excludeWorktrees(run: Exec, clone: string): Promise<void> {
  await excludeFromGit(run, clone, "/.claude/worktrees/");
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

function notOurs(): Shareable {
  return new Shareable(
    "The branch is checked out in a folder Wake didn't make, so Wake won't work in it.",
  );
}

/** Whether `path` is one of `made`, however either is spelled. */
export async function isMade(made: readonly string[], path: string): Promise<boolean> {
  for (const one of made) if (await sameFolder(one, path)) return true;
  return false;
}

export async function prepareWorktree(
  run: Exec,
  o: {
    clone: string;
    branch: string;
    root: string;
    /** Whether Wake made this folder: a run carries on only in one it did. */
    ours?: (path: string) => Promise<boolean>;
  },
): Promise<Prepared> {
  const ours = o.ours ?? (async () => true);
  await git(run, ["fetch", "origin", "--prune", "--quiet"], o.clone);
  // Forget worktrees whose folders were deleted by hand, so their branches
  // can be checked out again. Only folders already gone; never a locked one.
  await git(run, ["worktree", "prune"], o.clone);
  if (o.root.startsWith(`${o.clone}/`)) await excludeWorktrees(run, o.clone);
  const defaultBranch = await defaultBranchOf(run, o.clone);
  // A run pushes its branch; on the default branch that is a push to it.
  if (o.branch === defaultBranch) {
    throw new Shareable(
      `Wake won't run on ${defaultBranch}, the default branch; a run needs a branch of its own.`,
    );
  }
  const cwd = worktreePath(o.root, o.branch);

  if (await exists(cwd)) {
    const current = await git(run, ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (current !== o.branch) {
      throw new Shareable(
        `The run's worktree is on another branch, not ${o.branch}; wakectl prune removes it.`,
      );
    }
    if (!(await ours(cwd))) throw notOurs();
    return { cwd, defaultBranch };
  }

  // A branch is checked out once: if an earlier run, of this tool or another,
  // already has it, carry on there rather than fail. Not the person's own
  // checkout: that git refuses below, and the run fails saying why.
  const elsewhere = await checkedOutAt(run, o.clone, o.branch);
  if (elsewhere && !(await sameFolder(elsewhere, o.clone))) {
    // The person's own worktree, uncommitted work and all, is theirs.
    if (!(await ours(elsewhere))) throw notOurs();
    return { cwd: elsewhere, defaultBranch };
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
    await git(run, [...NO_HOOKS, "worktree", "add", "--quiet", cwd, o.branch], o.clone);
  } else if (remote) {
    await git(
      run,
      [
        ...NO_HOOKS,
        "worktree",
        "add",
        "--quiet",
        "--track",
        "-b",
        o.branch,
        cwd,
        `origin/${o.branch}`,
      ],
      o.clone,
    );
  } else {
    await git(
      run,
      [
        ...NO_HOOKS,
        "worktree",
        "add",
        "--quiet",
        "--no-track",
        "-b",
        o.branch,
        cwd,
        `origin/${defaultBranch}`,
      ],
      o.clone,
    );
  }
  return { cwd, defaultBranch };
}
