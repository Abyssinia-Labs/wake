// A summons names a repository as `owner/name`; a run needs this machine's
// clone of it. Wake looks under the folders the person named, one and two
// levels down, and matches each clone's `origin`.
import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { type Exec, git } from "./exec";

/** `owner/name`, lower-cased, from any GitHub remote URL, or null. */
export function repoFromRemote(url: string): string | null {
  const match = url
    .trim()
    .match(/github\.com[:/]+([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/);
  if (!match?.[1] || !match[2]) return null;
  return `${match[1]}/${match[2]}`.toLowerCase();
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function children(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules")
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

/**
 * Main clones only: a worktree's `.git` is a file, and a run's own worktree
 * must never become the base of the next one.
 */
async function clonesUnder(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const dir of await children(root)) {
    if (await isDirectory(join(dir, ".git"))) {
      found.push(dir);
      continue;
    }
    for (const inner of await children(dir)) {
      if (await isDirectory(join(inner, ".git"))) found.push(inner);
    }
  }
  return found;
}

export async function findClone(run: Exec, repo: string, roots: string[]): Promise<string | null> {
  const wanted = repo.toLowerCase();
  for (const root of roots) {
    for (const clone of await clonesUnder(root)) {
      try {
        // The URL as configured: `remote get-url` applies insteadOf rewrites,
        // which would hide the GitHub name the summons uses.
        const remote = await git(run, ["config", "--get", "remote.origin.url"], clone);
        if (repoFromRemote(remote) === wanted) return clone;
      } catch {
        // A clone without an origin is not one a summons can name.
      }
    }
  }
  return null;
}

/** Every clone under `roots` with a GitHub origin, as `owner/name`: what setup offers to approve. */
export async function listClones(
  run: Exec,
  roots: string[],
): Promise<{ repo: string; path: string }[]> {
  const found = new Map<string, string>();
  for (const root of roots) {
    for (const clone of await clonesUnder(root)) {
      try {
        const repo = repoFromRemote(
          await git(run, ["config", "--get", "remote.origin.url"], clone),
        );
        if (repo && !found.has(repo)) found.set(repo, clone);
      } catch {
        // No origin: nothing a summons could name.
      }
    }
  }
  return [...found]
    .map(([repo, path]) => ({ repo, path }))
    .sort((a, b) => a.repo.localeCompare(b.repo));
}
