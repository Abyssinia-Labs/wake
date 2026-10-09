// Opt-in (`wakectl trust codex on`): Codex asks whether to trust a folder the
// first time it opens one interactively, and every run's worktree is new, so
// a run in herdr stopped on that question until someone answered it. With
// this on, Wake trusts the run's own worktree in Codex's config first, and
// `wakectl prune` takes the entry out with the worktree. Codex's per-run `-c`
// override cannot do it: it splits a key at every dot, quoted or not, and a
// worktree path has one. Each entry is three lines Wake marks as its own, and
// nothing else in the file is touched.
import { readFile, realpath, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const MARK = "# Added by Wake for a run's worktree; wakectl prune removes it.";

export function codexConfigPath(): string {
  return join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "config.toml");
}

/** A TOML basic string: quotes, backslashes and control characters escaped. */
export function tomlString(text: string): string {
  const escaped = text
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/\p{Cc}/gu, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return `"${escaped}"`;
}

function header(folder: string): string {
  return `[projects.${tomlString(folder)}]`;
}

// Two runs starting together would each read the file and write it back,
// and one entry would be lost: writes take turns.
let turn: Promise<unknown> = Promise.resolve();

function inTurn<T>(work: () => Promise<T>): Promise<T> {
  const mine = turn.catch(() => undefined).then(work);
  turn = mine;
  return mine;
}

/** Whole or not at all, through a link to the real file (dotfiles often link it). */
async function replace(file: string, text: string): Promise<void> {
  const real = await realpath(file).catch(() => file);
  const temporary = `${real}.wake-${process.pid}.tmp`;
  await writeFile(temporary, text);
  await rename(temporary, real);
}

async function read(file: string): Promise<string> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return "";
  }
}

/** True when it added the entry; false when the folder was already in the file. */
export function trustCodexFolder(folder: string, file = codexConfigPath()): Promise<boolean> {
  return inTurn(async () => {
    const text = await read(file);
    if (text.includes(header(folder))) return false;
    const block = `${MARK}\n${header(folder)}\ntrust_level = "trusted"\n`;
    await replace(file, `${text}${text === "" || text.endsWith("\n") ? "" : "\n"}\n${block}`);
    return true;
  });
}

/** Takes out an entry Wake added for `folder`, and only one Wake added. */
export function untrustCodexFolder(folder: string, file = codexConfigPath()): Promise<boolean> {
  return inTurn(async () => {
    const text = await read(file);
    const block = `\n${MARK}\n${header(folder)}\ntrust_level = "trusted"\n`;
    if (!text.includes(block)) return false;
    await replace(file, text.replace(block, ""));
    return true;
  });
}
