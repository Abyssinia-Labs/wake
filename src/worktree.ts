// A run works in its own worktree of the person's clone, on the branch the
// app named, so it never touches what the person has checked out. It lives
// in the clone's .claude/worktrees/, where Claude Code keeps its own, so the
// session belongs to the repository: `claude --resume` there, then Ctrl+W,
// lists it. The worktree is kept afterwards; resuming needs the same folder.
// Claude Code's own --worktree is not used: it always makes a new
// `worktree-<name>` branch, and a run must be on the ticket's branch.
import { access, appendFile, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { AgentTool } from "./contract";
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
  let path: string | null = null;
  for (const line of listed.split("\n")) {
    if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
    if (line === `branch refs/heads/${branch}` && path) return path;
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

export async function prepareWorktree(
  run: Exec,
  o: { clone: string; branch: string; root: string },
): Promise<Prepared> {
  await git(run, ["fetch", "origin", "--prune", "--quiet"], o.clone);
  if (o.root.startsWith(`${o.clone}/`)) await excludeWorktrees(run, o.clone);
  const defaultBranch = await defaultBranchOf(run, o.clone);
  const cwd = worktreePath(o.root, o.branch);

  if (await exists(cwd)) {
    const current = await git(run, ["rev-parse", "--abbrev-ref", "HEAD"], cwd);
    if (current !== o.branch) {
      throw new Error(`${cwd} is on ${current}, not ${o.branch}; remove it with wakectl prune.`);
    }
    return { cwd, defaultBranch };
  }

  // A branch is checked out once: if an earlier run, of this tool or another,
  // already has it, carry on there rather than fail. Not the person's own
  // checkout: that git refuses below, and the run fails saying why.
  const elsewhere = await checkedOutAt(run, o.clone, o.branch);
  if (elsewhere && !(await sameFolder(elsewhere, o.clone)))
    return { cwd: elsewhere, defaultBranch };

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
