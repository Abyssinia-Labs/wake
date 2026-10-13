// The changelog, read: CHANGELOG.md at the root for wakectl, and one in each
// package for app developers. One reader for every place that shows it:
// `wakectl update`, wakectl.dev, a release's notes, and the checks in CI.
// The format is strict so all of them can rely on it:
//
//   ## Unreleased
//   ## 0.4.0 — 2026-10-14
//   ### Added
//   - **A headline that stands alone.** Then what it means for a person.

export const CATEGORIES = [
  "Added",
  "Changed",
  "Deprecated",
  "Removed",
  "Fixed",
  "Security",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Entry = { headline: string; body: string };
export type Group = { category: Category; entries: Entry[] };
/** A version's section; `version` is null for Unreleased. */
export type Release = { version: string | null; date: string | null; groups: Group[] };
export type Changelog = { intro: string; releases: Release[]; problems: string[] };

const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const RELEASED = /^## (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2})$/;
const HEADLINE = /^\*\*(.+?)\*\*\s*(.*)$/s;

type Raw = { group: Group; text: string; at: string };

/** Every problem is collected rather than thrown, so a check lists them all at once. */
export function parseChangelog(text: string): Changelog {
  const problems: string[] = [];
  const releases: Release[] = [];
  const intro: string[] = [];
  const raws: Raw[] = [];
  let release: Release | null = null;
  let group: Group | null = null;
  let raw: Raw | null = null;
  text.split("\n").forEach((line, i) => {
    const at = `line ${i + 1}`;
    if (line.startsWith("## ")) {
      const released = line.trimEnd().match(RELEASED);
      if (line.trimEnd() === "## Unreleased") release = { version: null, date: null, groups: [] };
      else if (released?.[1] && released[2]) {
        release = { version: released[1], date: released[2], groups: [] };
      } else {
        problems.push(`${at}: "${line}" isn't "## Unreleased" or "## X.Y.Z — YYYY-MM-DD".`);
        release = null;
      }
      if (release) releases.push(release);
      group = null;
      raw = null;
    } else if (line.startsWith("### ")) {
      const category = CATEGORIES.find((one) => `### ${one}` === line.trimEnd());
      if (!category) problems.push(`${at}: "${line}" isn't one of ${CATEGORIES.join(", ")}.`);
      group = category && release ? { category, entries: [] } : null;
      if (group && release) release.groups.push(group);
      raw = null;
    } else if (line.startsWith("- ")) {
      if (!group) problems.push(`${at}: an entry sits under a ### category.`);
      raw = group ? { group, text: line.slice(2).trim(), at } : null;
      if (raw) raws.push(raw);
    } else if (line.startsWith("  ") && raw) {
      // An entry wraps onto indented lines, its headline too.
      raw.text = `${raw.text} ${line.trim()}`;
    } else if (line.trim() && !release && !line.startsWith("# ")) {
      intro.push(line.trimEnd());
    } else if (line.trim() && release) {
      problems.push(`${at}: only categories and entries go in a version's section.`);
    }
  });
  for (const one of raws) {
    const match = one.text.match(HEADLINE);
    if (match?.[1]) one.group.entries.push({ headline: match[1], body: match[2] ?? "" });
    else problems.push(`${one.at}: an entry starts with a **bold headline**.`);
  }
  return { intro: intro.join("\n"), releases, problems };
}

/** Negative when `a` is older than `b`. */
export function compareVersions(a: string, b: string): number {
  const x = a.match(VERSION)?.slice(1).map(Number) ?? [];
  const y = b.match(VERSION)?.slice(1).map(Number) ?? [];
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function releaseOf(log: Changelog, version: string): Release | undefined {
  return log.releases.find((one) => one.version === version);
}

/** A version's section, as opposed to Unreleased. */
export type Released = Release & { version: string };

/** The releases after `from`, up to and including `to`, newest first. */
export function releasesBetween(log: Changelog, from: string, to: string): Released[] {
  return log.releases.filter(
    (one): one is Released =>
      one.version !== null &&
      compareVersions(one.version, from) > 0 &&
      compareVersions(one.version, to) <= 0,
  );
}

export function entryCount(release: Release): number {
  return release.groups.reduce((sum, group) => sum + group.entries.length, 0);
}

/** A release's section as Markdown, for its notes on GitHub. */
export function notesOf(release: Release): string {
  return release.groups
    .map((group) => {
      const entries = group.entries.map((one) =>
        `- **${one.headline}**${one.body ? ` ${one.body}` : ""}`.trimEnd(),
      );
      return [`### ${group.category}`, "", ...entries].join("\n");
    })
    .join("\n\n");
}

/** The anchor wakectl.dev gives a version: `v0-4-0`. */
export function anchorOf(version: string): string {
  return `v${version.replaceAll(".", "-")}`;
}
