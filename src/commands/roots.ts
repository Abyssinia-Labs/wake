// `wakectl roots [add|remove <folder>]`: the folders Wake looks in for your
// clones, one and two folders down. Setup asks the same question; this is
// its answer as a command, so a program (Wake for Mac's setup) changes it
// without writing the config itself.
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, normalize } from "node:path";
import { type Config, loadConfig, saveConfig } from "../config";
import { say } from "../log";
import { bold, cyan, dim, mark, tildify } from "../ui";

const USAGE = "usage: wakectl roots [add|remove <folder>]";

/** A folder as the config keeps it: whole, with `~` expanded and no trailing slash. */
export function folderOf(given: string, home = homedir()): string {
  const expanded =
    given === "~" ? home : given.startsWith("~/") ? join(home, given.slice(2)) : given;
  if (!isAbsolute(expanded)) throw new Error(`${given} isn't a whole path; start it with / or ~/.`);
  const clean = normalize(expanded);
  return clean.length > 1 && clean.endsWith("/") ? clean.slice(0, -1) : clean;
}

/** The roots after adding or removing one; adding keeps the order and never doubles. */
export function nextRoots(
  roots: readonly string[],
  action: "add" | "remove",
  folder: string,
): string[] {
  if (action === "remove") return roots.filter((one) => one !== folder);
  return roots.includes(folder) ? [...roots] : [...roots, folder];
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function rootsLines(config: Pick<Config, "roots">): string[] {
  if (config.roots.length === 0) {
    return [
      `Wake looks for clones nowhere yet. ${dim("Add a folder:")} ${cyan("wakectl roots add ~/Projects")}`,
    ];
  }
  return [
    bold("Wake looks for clones in"),
    ...config.roots.map((root) => `  ${mark.ok()} ${tildify(root)}`),
  ];
}

export async function roots(action: string | undefined, given: string | undefined): Promise<void> {
  const config = await loadConfig();
  if (action === undefined) return say(rootsLines(config).join("\n"));
  if ((action !== "add" && action !== "remove") || !given) throw new Error(USAGE);
  const folder = folderOf(given);
  if (action === "add" && !isFolder(folder))
    throw new Error(`${tildify(folder)} isn't a folder here.`);
  if (action === "remove" && !config.roots.includes(folder)) {
    throw new Error(`Wake doesn't look in ${tildify(folder)}. wakectl roots lists where it does.`);
  }
  await saveConfig({ ...config, roots: nextRoots(config.roots, action, folder) });
  say(
    action === "add"
      ? `${mark.ok()} Wake looks for clones in ${bold(tildify(folder))}, one and two folders down`
      : `${mark.ok()} Wake no longer looks in ${bold(tildify(folder))}`,
  );
}
