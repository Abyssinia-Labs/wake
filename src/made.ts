// The worktrees Wake made, so `wakectl prune` removes those and nothing
// else: a clone's .claude/worktrees/ also holds Claude Code's own worktrees
// and whatever the person keeps there.
import { readFile } from "node:fs/promises";
import { writeJson } from "./config";

async function read(path: string): Promise<string[]> {
  try {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(raw) ? raw.filter((one): one is string => typeof one === "string") : [];
  } catch {
    return [];
  }
}

export async function madeWorktrees(path: string): Promise<string[]> {
  return await read(path);
}

export async function rememberWorktree(path: string, worktree: string): Promise<void> {
  const known = await read(path);
  if (!known.includes(worktree)) await writeJson(path, [...known, worktree]);
}

export async function forgetWorktree(path: string, worktree: string): Promise<void> {
  const known = await read(path);
  if (known.includes(worktree))
    await writeJson(
      path,
      known.filter((one) => one !== worktree),
    );
}
