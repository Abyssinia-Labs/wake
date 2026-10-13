// The changelogs, read at build time from the repository's own files with
// the reader `wakectl update` and CI use (src/changelog.ts), so the site
// can't show anything the files don't say. Unreleased stays off the site:
// it isn't on npm yet.
import wakeText from "../../../CHANGELOG.md?raw";
import convexText from "../../../packages/convex/CHANGELOG.md?raw";
import serverText from "../../../packages/server/CHANGELOG.md?raw";
import { anchorOf, parseChangelog, type Release } from "../../../src/changelog";

export type { Entry, Group, Release } from "../../../src/changelog";

/** A changelog's released versions, newest first, each with its anchor on the page. */
export type Log = { releases: (Release & { version: string; anchor: string })[] };

function released(text: string, prefix = ""): Log {
  const log = parseChangelog(text);
  // A broken changelog fails the build, as CI would.
  if (log.problems.length > 0) throw new Error(`The changelog doesn't parse: ${log.problems[0]}`);
  return {
    releases: log.releases.flatMap((one) =>
      one.version
        ? [{ ...one, version: one.version, anchor: `${prefix}${anchorOf(one.version)}` }]
        : [],
    ),
  };
}

export const wakeLog = released(wakeText);
export const convexLog = released(convexText, "convex-");
export const serverLog = released(serverText, "server-");

/** The newest release and the headline to lead with: its first addition, else its first entry. */
export function latest(log: Log): { release: Log["releases"][number]; headline: string } | null {
  const release = log.releases[0];
  if (!release) return null;
  const lead = release.groups.find((group) => group.category === "Added") ?? release.groups[0];
  const headline = lead?.entries[0]?.headline;
  return headline ? { release, headline } : null;
}

export function longDate(date: string | null): string {
  if (!date) return "";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * An entry's Markdown as HTML: code, bold and links, the only marks the
 * format uses. Everything is escaped first, and a link goes only to
 * wakectl.dev's own pages or https.
 */
export function inline(markdown: string): string {
  return escapeHtml(markdown)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(((?:https:\/\/|\/)[^)\s]+)\)/g, '<a href="$2">$1</a>');
}
