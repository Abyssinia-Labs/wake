// Real git against throwaway repositories: worktrees are where a run's
// mistakes would land on the person's machine, so these are not faked.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec, git } from "./exec";
import { findClone, repoFromRemote } from "./repos";
import { prepareWorktree } from "./worktree";

let dir = "";
let clone = "";
const repo = "abyssinia-labs/sample";

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "wake-git-"));
  const origin = join(dir, "origin.git");
  const seed = join(dir, "seed");
  await git(exec, ["init", "--quiet", "--bare", "-b", "main", origin]);
  await git(exec, ["init", "--quiet", "-b", "main", seed]);
  await writeFile(join(seed, "README.md"), "hi\n");
  await git(exec, ["add", "."], seed);
  await git(
    exec,
    ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "--quiet", "-m", "init"],
    seed,
  );
  await git(exec, ["push", "--quiet", origin, "main"], seed);
  await git(exec, ["push", "--quiet", origin, "main:gat-9-existing"], seed);
  clone = join(dir, "projects", "sample");
  await git(exec, ["clone", "--quiet", origin, clone]);
  // findClone matches GitHub remotes; point origin's URL there, keep fetching locally.
  await git(
    exec,
    ["remote", "set-url", "origin", `git@github.com:Abyssinia-Labs/sample.git`],
    clone,
  );
  await git(exec, ["config", "remote.origin.pushurl", origin], clone);
  await git(
    exec,
    ["config", `url.${origin}.insteadOf`, "git@github.com:Abyssinia-Labs/sample.git"],
    clone,
  );
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("repoFromRemote", () => {
  test("reads every GitHub remote shape", () => {
    for (const url of [
      "git@github.com:Abyssinia-Labs/gatherd.git",
      "https://github.com/Abyssinia-Labs/gatherd",
      "https://github.com/Abyssinia-Labs/gatherd.git/",
      "ssh://git@github.com/Abyssinia-Labs/gatherd.git",
    ]) {
      expect(repoFromRemote(url)).toBe("abyssinia-labs/gatherd");
    }
    expect(repoFromRemote("https://gitlab.com/a/b")).toBeNull();
  });
});

describe("findClone", () => {
  test("finds the clone by its origin, case aside", async () => {
    expect(await findClone(exec, "Abyssinia-Labs/Sample", [join(dir, "projects")])).toBe(clone);
    expect(await findClone(exec, "abyssinia-labs/other", [join(dir, "projects")])).toBeNull();
  });
});

describe("prepareWorktree", () => {
  test("a new branch starts from the default branch, and is reused after", async () => {
    const root = join(dir, "worktrees");
    const first = await prepareWorktree(exec, { clone, repo, branch: "gat-70-new", root });
    expect(first.defaultBranch).toBe("main");
    expect(await git(exec, ["rev-parse", "--abbrev-ref", "HEAD"], first.cwd)).toBe("gat-70-new");
    expect(await git(exec, ["rev-parse", "--abbrev-ref", "HEAD"], clone)).toBe("main");
    const again = await prepareWorktree(exec, { clone, repo, branch: "gat-70-new", root });
    expect(again.cwd).toBe(first.cwd);
  });

  test("a branch already on the remote is tracked, not recreated", async () => {
    const root = join(dir, "worktrees");
    const { cwd } = await prepareWorktree(exec, { clone, repo, branch: "gat-9-existing", root });
    expect(await git(exec, ["rev-parse", "--abbrev-ref", "@{upstream}"], cwd)).toBe(
      "origin/gat-9-existing",
    );
  });
});
