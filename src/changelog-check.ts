// What CI holds a changelog to, so no release ships without its notes and
// no change merges without its entry, whoever wrote it. Instructions to an
// agent are the weakest fence: Wake's own runs load none of the repository's
// settings or hooks, and CI is the one thing every agent meets.
import {
  type Changelog,
  compareVersions,
  entryCount,
  parseChangelog,
  type Release,
  releaseOf,
} from "./changelog";

/** Each changelog, the package.json whose version it follows, and the tag prefix that releases it. */
export const LOGS = [
  { file: "CHANGELOG.md", manifest: "package.json", tag: "v" },
  {
    file: "packages/convex/CHANGELOG.md",
    manifest: "packages/convex/package.json",
    tag: "convex-v",
  },
  {
    file: "packages/server/CHANGELOG.md",
    manifest: "packages/server/package.json",
    tag: "server-v",
  },
] as const;
export type Log = (typeof LOGS)[number];

function unreleased(log: Changelog): Release | undefined {
  return log.releases.find((one) => one.version === null);
}

/** Problems with a changelog whose package is at `version`; none means it passes. */
export function checkChangelog(text: string, version: string): string[] {
  const log = parseChangelog(text);
  const problems = [...log.problems];
  if (log.releases[0]?.version !== null) problems.push('The first section is "## Unreleased".');
  if (log.releases.filter((one) => one.version === null).length > 1) {
    problems.push('There is one "## Unreleased" section, not more.');
  }
  const released = log.releases.filter((one) => one.version !== null);
  released.forEach((one, i) => {
    const older = released[i + 1];
    if (entryCount(one) === 0) problems.push(`${one.version} has no entries.`);
    if (!older?.version || !one.version) return;
    if (compareVersions(one.version, older.version) <= 0) {
      problems.push(`${one.version} sits above ${older.version}: newest first.`);
    }
    if ((one.date ?? "") < (older.date ?? "")) {
      problems.push(`${one.version} is dated before ${older.version}.`);
    }
  });
  if (!releaseOf(log, version)) {
    problems.push(`The package is at ${version}, which has no section.`);
  }
  for (const one of released) {
    if (one.version && compareVersions(one.version, version) > 0) {
      problems.push(`${one.version} has a section, but the package is still at ${version}.`);
    }
  }
  return problems;
}

/**
 * Whether `version` may be released: its section has entries, and nothing
 * waits in Unreleased, which would ship without being in its notes.
 */
export function releaseProblems(text: string, version: string): string[] {
  const log = parseChangelog(text);
  const release = releaseOf(log, version);
  const problems = [...log.problems];
  if (!release) problems.push(`There is no "## ${version} — YYYY-MM-DD" section.`);
  else if (entryCount(release) === 0) problems.push(`${version}'s section has no entries.`);
  const waiting = unreleased(log);
  if (waiting && entryCount(waiting) > 0) {
    problems.push(
      `Unreleased still has ${entryCount(waiting)} entries, which ${version} would ship without its notes saying so: move them into its section.`,
    );
  }
  return problems;
}

/** The changelog and version a tag releases: `v0.4.0`, `convex-v0.3.1`, `server-v0.5.0`. */
export function logOfTag(tag: string): { log: Log; version: string } | null {
  // Longest prefix first, so `server-v` is not read as `v`.
  for (const log of [...LOGS].sort((a, b) => b.tag.length - a.tag.length)) {
    if (!tag.startsWith(log.tag)) continue;
    const version = tag.slice(log.tag.length);
    return /^\d+\.\d+\.\d+$/.test(version) ? { log, version } : null;
  }
  return null;
}

const TEST = /(\.test\.ts|\/test-[^/]*\.ts)$/;
/** The repository's own tooling under src/, kept out of the package: never news to anyone. */
const TOOLING = new Set(["src/changelog-check.ts"]);

/** Which changelog a changed file is news for, if any: tests and docs are not. */
export function logOfFile(path: string): Log["file"] | null {
  if (TEST.test(path) || TOOLING.has(path)) return null;
  if (path.startsWith("packages/convex/src/")) return "packages/convex/CHANGELOG.md";
  if (path.startsWith("packages/server/src/")) return "packages/server/CHANGELOG.md";
  // Wake for GitHub has no versions: its news rides in wakectl's changelog.
  if (path.startsWith("src/") || path.startsWith("apps/github/src/")) return "CHANGELOG.md";
  if (path === "docs/spec/wake-v1.md") return "CHANGELOG.md";
  return null;
}

/**
 * Whether a pull request wrote under Unreleased, or released it: touching
 * the file is not enough, since a typo fixed in an old section touches it.
 */
export function unreleasedChanged(before: string, after: string): boolean {
  const pending = (text: string) => JSON.stringify(unreleased(parseChangelog(text)) ?? null);
  return pending(before) !== pending(after);
}

/** The changelogs a pull request's changes call for whose Unreleased it left alone. */
export function missingEntries(
  changed: readonly string[],
  wrote: (file: Log["file"]) => boolean,
): Log["file"][] {
  const wanted = new Set(changed.map(logOfFile).filter((one) => one !== null));
  return [...wanted].filter((file) => !wrote(file));
}

export const BUMPS = ["patch", "minor", "major"] as const;

/** The version after `current`: a bump's, or one given outright, which must be newer. */
export function nextVersion(current: string, wanted: string): string {
  const [major = 0, minor = 0, patch = 0] = current.split(".").map(Number);
  if (wanted === "major") return `${major + 1}.0.0`;
  if (wanted === "minor") return `${major}.${minor + 1}.0`;
  if (wanted === "patch") return `${major}.${minor}.${patch + 1}`;
  if (!/^\d+\.\d+\.\d+$/.test(wanted)) {
    throw new Error(`"${wanted}" isn't patch, minor, major or a version like 1.2.3.`);
  }
  if (compareVersions(wanted, current) <= 0) {
    throw new Error(`${wanted} isn't newer than ${current}.`);
  }
  return wanted;
}

/**
 * Unreleased becomes `version`'s section, dated, and a new empty Unreleased
 * sits above it: the entries stay where they were written, under a heading.
 */
export function cutRelease(text: string, version: string, date: string): string {
  const log = parseChangelog(text);
  const waiting = unreleased(log);
  if (!waiting || entryCount(waiting) === 0) {
    throw new Error("Unreleased is empty: there is nothing to release.");
  }
  if (releaseOf(log, version)) throw new Error(`${version} already has a section.`);
  return text.replace(/^## Unreleased[ \t]*$/m, `## Unreleased\n\n## ${version} — ${date}`);
}

/** `package.json` with its version changed and nothing else, formatting kept. */
export function bumpManifest(text: string, version: string): string {
  const bumped = text.replace(/^(\s*"version":\s*")[^"]+(")/m, `$1${version}$2`);
  if (bumped === text) throw new Error("package.json has no version to change.");
  return bumped;
}
