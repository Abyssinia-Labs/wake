// Real git against throwaway repositories: worktrees are where a run's
// mistakes would land on the person's machine, so these are not faked.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exec, git } from "./exec";
import { findClone, repoFromRemote } from "./repos";
import { isMade, prepareWorktree } from "./worktree";

let dir = "";
let clone = "";

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
  test("a new branch starts from the default branch, in the clone's .claude/worktrees, reused after", async () => {
    const first = await prepareWorktree(exec, {
      clone,
      branch: "gat-70-new",
      root: join(clone, ".claude", "worktrees"),
    });
    expect(first.cwd).toBe(join(clone, ".claude", "worktrees", "gat-70-new"));
    expect(first.defaultBranch).toBe("main");
    expect(await git(exec, ["rev-parse", "--abbrev-ref", "HEAD"], first.cwd)).toBe("gat-70-new");
    expect(await git(exec, ["rev-parse", "--abbrev-ref", "HEAD"], clone)).toBe("main");
    const again = await prepareWorktree(exec, {
      clone,
      branch: "gat-70-new",
      root: join(clone, ".claude", "worktrees"),
    });
    expect(again.cwd).toBe(first.cwd);
    // Out of the clone's `git status`, through .git/info/exclude, once.
    expect(await git(exec, ["status", "--porcelain"], clone)).toBe("");
    const exclude = await Bun.file(join(clone, ".git", "info", "exclude")).text();
    expect(exclude.split("\n").filter((line) => line === "/.claude/worktrees/")).toHaveLength(1);
  });

  test("a branch already on the remote is tracked, not recreated", async () => {
    const { cwd } = await prepareWorktree(exec, {
      clone,
      branch: "gat-9-existing",
      root: join(clone, ".claude", "worktrees"),
    });
    expect(await git(exec, ["rev-parse", "--abbrev-ref", "@{upstream}"], cwd)).toBe(
      "origin/gat-9-existing",
    );
  });
});

describe("each tool's own place", () => {
  test("a branch another tool's run already has is carried on there", async () => {
    const elsewhere = join(dir, "codex-root");
    const first = await prepareWorktree(exec, {
      clone,
      branch: "gat-71-shared",
      root: join(clone, ".claude", "worktrees"),
    });
    const again = await prepareWorktree(exec, { clone, branch: "gat-71-shared", root: elsewhere });
    const { realpath } = await import("node:fs/promises");
    expect(await realpath(again.cwd)).toBe(await realpath(first.cwd));
  });

  test("a worktree whose folder was deleted by hand is not carried on in", async () => {
    const gone = await prepareWorktree(exec, {
      clone,
      branch: "gat-72-gone",
      root: join(clone, ".claude", "worktrees"),
    });
    await rm(gone.cwd, { recursive: true, force: true });
    const { checkedOutAt } = await import("./worktree");
    expect(await checkedOutAt(exec, clone, "gat-72-gone")).toBeNull();
    const fresh = await prepareWorktree(exec, {
      clone,
      branch: "gat-72-gone",
      root: join(dir, "cursor-root"),
    });
    expect(fresh.cwd).toBe(join(dir, "cursor-root", "gat-72-gone"));
    expect(await git(exec, ["rev-parse", "--abbrev-ref", "HEAD"], fresh.cwd)).toBe("gat-72-gone");
  });

  test("the clone's hooks don't run when Wake makes a worktree", async () => {
    const hooks = join(dir, "hooks");
    const marker = join(dir, "hook-ran");
    await Bun.write(join(hooks, "post-checkout"), `#!/bin/sh\ntouch '${marker}'\n`);
    await Bun.$`chmod +x ${join(hooks, "post-checkout")}`.quiet();
    await git(exec, ["config", "core.hooksPath", hooks], clone);
    try {
      await prepareWorktree(exec, { clone, branch: "gat-74-hooks", root: join(dir, "wt-74") });
      expect(await Bun.file(marker).exists()).toBe(false);
    } finally {
      await git(exec, ["config", "--unset", "core.hooksPath"], clone);
    }
  });

  test("never the default branch", async () => {
    await expect(
      prepareWorktree(exec, { clone, branch: "main", root: join(dir, "wt-main") }),
    ).rejects.toThrow("default branch");
  });

  test("never a worktree Wake didn't make, the person's own included", async () => {
    const theirs = join(dir, "their-own");
    await git(exec, ["worktree", "add", "--quiet", "-b", "gat-73-mine", theirs, "main"], clone);
    await expect(
      prepareWorktree(exec, {
        clone,
        branch: "gat-73-mine",
        root: join(dir, "wt-73"),
        ours: async (path) => isMade([], path),
      }),
    ).rejects.toThrow("didn't make");
    const carried = await prepareWorktree(exec, {
      clone,
      branch: "gat-73-mine",
      root: join(dir, "wt-73"),
      ours: async (path) => isMade([theirs], path),
    });
    const { realpath } = await import("node:fs/promises");
    expect(await realpath(carried.cwd)).toBe(await realpath(theirs));
  });

  test("Claude Code in the clone, Cursor and Codex in their own homes", async () => {
    const { worktreeRoot } = await import("./worktree");
    expect(worktreeRoot("claude", "/p/gatherd", "/h")).toBe("/p/gatherd/.claude/worktrees");
    expect(worktreeRoot("cursor", "/p/gatherd", "/h")).toBe("/h/.cursor/worktrees/gatherd");
    const saved = process.env.CODEX_HOME;
    delete process.env.CODEX_HOME;
    expect(worktreeRoot("codex", "/p/gatherd", "/h")).toBe("/h/.codex/worktrees/wake/gatherd");
    if (saved !== undefined) process.env.CODEX_HOME = saved;
  });
});
