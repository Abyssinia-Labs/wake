// Opt-in (`wakectl trust codex on`): Codex asks whether to trust a folder the
// first time it opens one interactively, and every run's worktree is new, so
// a run in herdr stopped on that question until someone answered it. With
// this on, Wake trusts the run's own worktree in Codex's config first, and
// `wakectl prune` takes the entry out with the worktree. Codex's per-run `-c`
// override cannot do it: it splits a key at every dot, quoted or not, and a
// worktree path has one. Each entry is three lines Wake marks as its own, and
// nothing else in the file is touched.
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const MARK = "# Added by Wake for a run's worktree; wakectl prune removes it.";

export function codexConfigPath(): string {
  return join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "config.toml");
}

/** A TOML basic string: quotes and backslashes escaped. */
function tomlString(text: string): string {
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function header(folder: string): string {
  return `[projects.${tomlString(folder)}]`;
}

async function read(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

/** True when it added the entry; false when the folder was already in the file. */
export async function trustCodexFolder(folder: string, file = codexConfigPath()): Promise<boolean> {
  const text = await read(file);
  if (text.includes(header(folder))) return false;
  const block = `${MARK}\n${header(folder)}\ntrust_level = "trusted"\n`;
  await writeFile(file, `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}\n${block}`);
  return true;
}

/** Takes out an entry Wake added for `folder`, and only one Wake added. */
export async function untrustCodexFolder(
  folder: string,
  file = codexConfigPath(),
): Promise<boolean> {
  const text = await read(file);
  const block = `\n${MARK}\n${header(folder)}\ntrust_level = "trusted"\n`;
  if (!text.includes(block)) return false;
  await writeFile(file, text.replace(block, ""));
  return true;
}
