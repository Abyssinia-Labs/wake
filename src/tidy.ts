// Tidying run worktrees (the owner's call, 2026-10-25): the listener removes
// the ones Wake made once they are finished with, so a clone's worktrees
// folder doesn't keep every ticket ever run. Work is never lost: a worktree
// with uncommitted changes stays, and so does one whose commits are on no
// remote and in no merged pull request. One a run is in stays, one a herdr
// tab still shows, and one a follow-up may still continue (run.ts).
import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { untrustCodexFolder } from "./codex-trust";
import type { Paths } from "./config";
import { type Exec, git, gitOk } from "./exec";
import type { RunRecord } from "./history";
import { forgetWorktree, madeWorktrees } from "./made";

/** A merged branch's worktree goes a day after its last run; a pushed one, a week. */
export const MERGED_HOURS = 24;
export const IDLE_DAYS = 7;
const HOUR = 60 * 60_000;

export type Tidied = {
  removed: { path: string; why: string }[];
  kept: { path: string; why: string }[];
};

export type TidyDeps = {
  exec: Exec;
  now: number;
  /** Whether a run's herdr tab is still open, its session on screen. */
  herdrOpen: (run: RunRecord) => Promise<boolean>;
};

/** The latest run in a folder, and when it last did anything. */
function lastIn(history: readonly RunRecord[], path: string): RunRecord | undefined {
  return [...history].reverse().find((run) => run.cwd === path);
}

/** Is everything the worktree holds in its repository's default branch, or in a merged pull request? */
async function merged(
  run: Exec,
  path: string,
  branch: string,
  base: string | null,
): Promise<"ancestor" | "pull" | null> {
  if (base && (await gitOk(run, ["merge-base", "--is-ancestor", "HEAD", base], path)))
    return "ancestor";
  // A squash merge leaves the branch's commits out of the default branch: ask
  // GitHub whether a merged pull request had exactly this head.
  const pulls = await run(
    [
      "gh",
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "merged",
      "--json",
      "headRefOid",
      "--limit",
      "1",
    ],
    { cwd: path },
  );
  if (pulls.code !== 0) return null;
  try {
    const head = await git(run, ["rev-parse", "HEAD"], path);
    const list: unknown = JSON.parse(pulls.stdout);
    return Array.isArray(list) &&
      list.some(
        (pr) =>
          typeof pr === "object" && pr !== null && "headRefOid" in pr && pr.headRefOid === head,
      )
      ? "pull"
      : null;
  } catch {
    return null;
  }
}

/** What becomes of one worktree, and why. */
async function judge(
  path: string,
  history: readonly RunRecord[],
  inUse: ReadonlySet<string>,
  deps: TidyDeps,
  fetched: Map<string, string | null>,
  idleDays: number,
): Promise<{ remove: boolean; why: string; branch?: string; repo?: string; force?: boolean }> {
  if (inUse.has(path)) return { remove: false, why: "a run is in it" };
  const run = deps.exec;
  const last = lastIn(history, path);
  if (last?.herdr && (await deps.herdrOpen(last)))
    return { remove: false, why: "its herdr tab is open" };
  if ((await git(run, ["status", "--porcelain"], path)) !== "") {
    return { remove: false, why: "it has uncommitted changes" };
  }
  const branch = await git(run, ["rev-parse", "--abbrev-ref", "HEAD"], path);
  const repo = dirname(
    await git(run, ["rev-parse", "--path-format=absolute", "--git-common-dir"], path),
  );
  // Once a tidy per clone: what the remote has now, without asking for a password.
  if (!fetched.has(repo)) {
    await run(
      [
        "/usr/bin/env",
        "GIT_TERMINAL_PROMPT=0",
        "git",
        "-c",
        "http.lowSpeedLimit=1000",
        "-c",
        "http.lowSpeedTime=20",
        "fetch",
        "--prune",
        "--quiet",
        "origin",
      ],
      { cwd: repo },
    );
    const head = await run(["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
      cwd: repo,
    });
    fetched.set(repo, head.code === 0 ? head.stdout.trim() : null);
  }
  const lastAt = last ? (last.finishedAt ?? last.startedAt) : (await stat(path)).mtimeMs;
  const idle = deps.now - lastAt;
  const landed = await merged(run, path, branch, fetched.get(repo) ?? null);
  if (landed) {
    if (idle < MERGED_HOURS * HOUR)
      return { remove: false, why: "merged, and a follow-up may still come" };
    return { remove: true, why: "its branch is merged", branch, repo, force: landed === "pull" };
  }
  const unpushed = Number(
    await git(run, ["rev-list", "--count", "HEAD", "--not", "--remotes"], path),
  );
  if (unpushed > 0)
    return { remove: false, why: `${unpushed} commit${unpushed === 1 ? "" : "s"} on no remote` };
  if (idle < idleDays * 24 * HOUR) return { remove: false, why: "used in the last week" };
  return { remove: true, why: `pushed, and untouched for ${idleDays} days`, branch, repo };
}

/**
 * Removes the run worktrees Wake made that are finished with, without force,
 * so git itself refuses one with changes; its branch goes too where that
 * loses nothing. Says what it removed, and what it kept for holding work.
 */
export async function tidyWorktrees(
  o: { paths: Paths; history: readonly RunRecord[]; inUse: ReadonlySet<string>; idleDays?: number },
  deps: TidyDeps,
): Promise<Tidied> {
  const tidied: Tidied = { removed: [], kept: [] };
  const fetched = new Map<string, string | null>();
  for (const path of await madeWorktrees(o.paths.made)) {
    try {
      await stat(path);
    } catch {
      // Already gone, by hand or by git: nothing to remove, nothing to remember.
      await forgetWorktree(o.paths.made, path);
      continue;
    }
    try {
      const verdict = await judge(path, o.history, o.inUse, deps, fetched, o.idleDays ?? IDLE_DAYS);
      if (!verdict.remove || !verdict.repo) {
        if (!/^(a run is in it|used in the last week|merged, and)/.test(verdict.why)) {
          tidied.kept.push({ path, why: verdict.why });
        }
        continue;
      }
      await git(deps.exec, ["worktree", "remove", path], verdict.repo);
      await forgetWorktree(o.paths.made, path);
      await untrustCodexFolder(path);
      // A squash-merged branch is in its pull request, not in an ancestor: -D, as GitHub has it.
      if (verdict.branch && verdict.branch !== "HEAD") {
        await deps.exec(["git", "branch", verdict.force ? "-D" : "-d", verdict.branch], {
          cwd: verdict.repo,
        });
      }
      tidied.removed.push({ path, why: verdict.why });
    } catch (error) {
      tidied.kept.push({ path, why: error instanceof Error ? error.message : String(error) });
    }
  }
  return tidied;
}
