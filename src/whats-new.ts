// What changed between the Wake a person had and the one `wakectl update`
// just installed, from the CHANGELOG.md the new package ships: offline, and
// always the notes of the version actually installed. Headlines only, as
// the changelog's format promises they stand alone; the site has the rest.
import { join } from "node:path";
import { anchorOf, parseChangelog, releasesBetween } from "./changelog";
import { plain } from "./log";
import { bold, cyan, dim, yellow } from "./ui";

export const CHANGELOG_URL = "https://wakectl.dev/changelog/";

/** More than this and the rest are counted, not listed: a long gap is the site's to show. */
const MOST = 12;

/** An entry's Markdown for a terminal: code in cyan, bold and links as their words. */
export function forTerminal(markdown: string): string {
  return plain(markdown)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, (_, code: string) => cyan(code));
}

/** The lines to print after updating from `from` to `to`; just the link when the notes can't be read. */
export function whatsNew(text: string | null, from: string, to: string): string[] {
  const link = dim(`  All of it: ${CHANGELOG_URL}#${anchorOf(to)}`);
  if (text === null) return [`${bold("What's new")} ${dim(`· ${CHANGELOG_URL}`)}`];
  const releases = releasesBetween(parseChangelog(text), from, to);
  if (releases.length === 0) return [];
  const lines = [bold(`What's new since ${from}`)];
  let shown = 0;
  let hidden = 0;
  for (const release of releases) {
    const entries = release.groups.flatMap((group) =>
      group.entries.map((entry) => ({ security: group.category === "Security", entry })),
    );
    if (shown >= MOST) {
      hidden += entries.length;
      continue;
    }
    lines.push(`  ${bold(release.version)}${release.date ? dim(`  ${release.date}`) : ""}`);
    for (const { security, entry } of entries) {
      if (shown >= MOST) {
        hidden += 1;
        continue;
      }
      // Security is the one a person should not skim past.
      lines.push(`    ${security ? yellow("security ") : ""}${forTerminal(entry.headline)}`);
      shown += 1;
    }
  }
  if (hidden > 0) lines.push(dim(`    and ${hidden} more`));
  lines.push(link);
  return lines;
}

/** The new install's own CHANGELOG.md, beside its src/, or null when it has none. */
export async function installedNotes(script: string): Promise<string | null> {
  const at = script.lastIndexOf("/src/");
  if (at < 0) return null;
  try {
    return await Bun.file(join(script.slice(0, at), "CHANGELOG.md")).text();
  } catch {
    return null;
  }
}
