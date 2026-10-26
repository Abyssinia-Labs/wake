// The tidy of run worktrees, on real repositories in a temp folder: what is
// finished with goes, with its branch; what holds work, or may still be
// followed up, stays. GitHub's answer on squash-merged pull requests is faked.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Paths } from "./config";
import { type Exec, exec, git } from "./exec";
import type { RunRecord } from "./history";
import { madeWorktrees, rememberWorktree } from "./made";
import { tidyWorktrees } from "./tidy";

const home = await mkdtemp(join(tmpdir(), "wake-tidy-"));
afterAll(() => rm(home, { recursive: true, force: true }));

const DAY = 24 * 60 * 60_000;
const now = Date.now();
const clone = join(home, "clone");
const paths = { made: join(home, "worktrees.json") } as Paths;
const who = ["-c", "user.name=Wake", "-c", "user.email=wake@example.com"];
const history: RunRecord[] = [];
let squashedHead = "";

async function commit(cwd: string, file: string): Promise<void> {
  await writeFile(join(cwd, file), file);
  await git(exec, ["add", file], cwd);
  await git(exec, [...who, "commit", "-q", "-m", file], cwd);
}

/** A run worktree on its own branch, with one commit, last used `ago` before now. */
async function worktree(branch: string, ago: number, o: { herdr?: boolean } = {}): Promise<string> {
  const path = join(home, "worktrees", branch);
  await git(exec, ["worktree", "add", "-q", "-b", branch, path, "main"], clone);
  await commit(path, `${branch}.txt`);
  await rememberWorktree(paths.made, path);
  history.push({
    name: branch,
    summons: branch,
    app: "gatherd",
    ref: branch,
    tool: "claude",
    sessionId: `${branch}-session`,
    cwd: path,
    startedAt: now - ago - 60_000,
    finishedAt: now - ago,
    ...(o.herdr ? { herdr: true } : {}),
  });
  return path;
}

beforeAll(async () => {
  const remote = join(home, "remote.git");
  await git(exec, ["init", "-q", "--bare", "-b", "main", remote]);
  await git(exec, ["clone", "-q", remote, clone]);
  await commit(clone, "README.md");
  await git(exec, ["push", "-q", "origin", "main"], clone);
  await git(exec, ["remote", "set-head", "origin", "main"], clone);

  // Merged into main and pushed, two days ago; and one merged an hour ago.
  for (const [branch, ago] of [
    ["merged", 2 * DAY],
    ["just-merged", 60 * 60_000],
  ] as const) {
    await worktree(branch, ago);
    await git(exec, ["merge", "-q", "--ff-only", branch], clone);
  }
  await git(exec, ["push", "-q", "origin", "main"], clone);
  // Pushed, never merged, idle ten days; and one pushed yesterday.
  for (const [branch, ago] of [
    ["pushed-idle", 10 * DAY],
    ["pushed-fresh", DAY],
  ] as const) {
    const path = await worktree(branch, ago);
    await git(exec, ["push", "-q", "-u", "origin", branch], path);
  }
  // Work that exists nowhere else: an unpushed commit, and an uncommitted change.
  await worktree("unpushed", 10 * DAY);
  const dirty = await worktree("dirty", 10 * DAY);
  await git(exec, ["push", "-q", "-u", "origin", "dirty"], dirty);
  await writeFile(join(dirty, "draft.txt"), "half done");
  // Squash-merged on GitHub: its commit is in a merged pull request, not in main.
  const squashed = await worktree("squashed", 3 * DAY);
  squashedHead = await git(exec, ["rev-parse", "HEAD"], squashed);
  // A run going now, and a run whose herdr tab is still open.
  await worktree("running", 10 * DAY);
  await worktree("in-herdr", 10 * DAY, { herdr: true });
});

const fakeGitHub: Exec = async (cmd, o) => {
  if (cmd[0] === "gh") {
    const branch = cmd[cmd.indexOf("--head") + 1];
    return {
      code: 0,
      stdout: JSON.stringify(branch === "squashed" ? [{ headRefOid: squashedHead }] : []),
      stderr: "",
    };
  }
  return await exec(cmd, o);
};

test("finished worktrees go with their branches; ones holding work, or too recent, stay", async () => {
  const at = (branch: string) => join(home, "worktrees", branch);
  const tidied = await tidyWorktrees(
    { paths, history, inUse: new Set([at("running")]) },
    { exec: fakeGitHub, now, herdrOpen: async (run) => run.name === "in-herdr" },
  );
  expect(tidied.removed.map((one) => [one.path, one.why]).sort()).toEqual(
    [
      [at("merged"), "its branch is merged"],
      [at("pushed-idle"), "pushed, and untouched for 7 days"],
      [at("squashed"), "its branch is merged"],
    ].sort(),
  );
  expect(tidied.kept.map((one) => [one.path, one.why]).sort()).toEqual(
    [
      [at("dirty"), "it has uncommitted changes"],
      [at("in-herdr"), "its herdr tab is open"],
      [at("unpushed"), "1 commit on no remote"],
    ].sort(),
  );
  const left = await madeWorktrees(paths.made);
  expect(left).not.toContain(at("merged"));
  expect(left).toContain(at("just-merged"));
  expect(left).toContain(at("pushed-fresh"));
  const branches = await git(exec, ["branch", "--format=%(refname:short)"], clone);
  expect(branches.split("\n")).not.toContain("merged");
  expect(branches.split("\n")).not.toContain("squashed");
  expect(branches.split("\n")).toContain("unpushed");
});
