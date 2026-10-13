import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  anchorOf,
  compareVersions,
  notesOf,
  parseChangelog,
  releaseOf,
  releasesBetween,
} from "./changelog";
import {
  bumpManifest,
  checkChangelog,
  cutRelease,
  LOGS,
  logOfFile,
  logOfTag,
  missingEntries,
  nextVersion,
  releaseProblems,
  unreleasedChanged,
} from "./changelog-check";

const LOG = `# Changelog

What changed, newest first.

## Unreleased

### Added

- **Something new.** Not out yet.

## 0.2.0 — 2026-10-12

### Added

- **Pick a model.** \`wakectl model claude opus\`, or the new
  question in setup.
- **A headline that wraps
  onto the next line.**

### Fixed

- **A signature names its tool.**

## 0.1.0 — 2026-10-09

### Added

- **The first release.**
`;

describe("reading a changelog", () => {
  test("sections, categories and entries, a wrapped headline included", () => {
    const log = parseChangelog(LOG);
    expect(log.problems).toEqual([]);
    expect(log.intro).toBe("What changed, newest first.");
    expect(log.releases.map((one) => one.version)).toEqual([null, "0.2.0", "0.1.0"]);
    const release = releaseOf(log, "0.2.0");
    expect(release?.date).toBe("2026-10-12");
    expect(release?.groups.map((one) => one.category)).toEqual(["Added", "Fixed"]);
    expect(release?.groups[0]?.entries).toEqual([
      {
        headline: "Pick a model.",
        body: "`wakectl model claude opus`, or the new question in setup.",
      },
      { headline: "A headline that wraps onto the next line.", body: "" },
    ]);
  });

  test("says what is wrong, every time it is", () => {
    const log = parseChangelog(
      "## 0.2 - yesterday\n## Unreleased\n### Improved\n- plain words\nstray text\n",
    );
    expect(log.problems).toEqual([
      'line 1: "## 0.2 - yesterday" isn\'t "## Unreleased" or "## X.Y.Z — YYYY-MM-DD".',
      'line 3: "### Improved" isn\'t one of Added, Changed, Deprecated, Removed, Fixed, Security.',
      "line 4: an entry sits under a ### category.",
      "line 5: only categories and entries go in a version's section.",
    ]);
  });

  test("the releases between two versions, newest first", () => {
    const log = parseChangelog(LOG);
    expect(releasesBetween(log, "0.1.0", "0.2.0").map((one) => one.version)).toEqual(["0.2.0"]);
    expect(releasesBetween(log, "0.0.9", "0.2.0")).toHaveLength(2);
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
  });

  test("a release's notes, and its anchor on the site", () => {
    const release = releaseOf(parseChangelog(LOG), "0.2.0");
    if (!release) throw new Error("no 0.2.0");
    expect(notesOf(release)).toBe(
      "### Added\n\n- **Pick a model.** `wakectl model claude opus`, or the new question in setup.\n- **A headline that wraps onto the next line.**\n\n### Fixed\n\n- **A signature names its tool.**",
    );
    expect(anchorOf("0.4.0")).toBe("v0-4-0");
  });
});

describe("what CI holds it to", () => {
  test("a good changelog at its package's version passes", () => {
    expect(checkChangelog(LOG, "0.2.0")).toEqual([]);
  });

  test("a version with no section, or one ahead of the package, fails", () => {
    expect(checkChangelog(LOG, "0.3.0")).toContain(
      "The package is at 0.3.0, which has no section.",
    );
    expect(checkChangelog(LOG, "0.1.0")).toContain(
      "0.2.0 has a section, but the package is still at 0.1.0.",
    );
  });

  test("newest first, Unreleased on top, and no empty release", () => {
    const shuffled = `## 0.1.0 — 2026-10-09\n### Added\n- **One.**\n## 0.2.0 — 2026-10-10\n`;
    expect(checkChangelog(shuffled, "0.1.0")).toEqual([
      'The first section is "## Unreleased".',
      "0.1.0 sits above 0.2.0: newest first.",
      "0.1.0 is dated before 0.2.0.",
      "0.2.0 has no entries.",
      "0.2.0 has a section, but the package is still at 0.1.0.",
    ]);
  });

  test("a release needs its section, with entries, and nothing left in Unreleased", () => {
    expect(releaseProblems(LOG, "0.3.0")).toEqual([
      'There is no "## 0.3.0 — YYYY-MM-DD" section.',
      "Unreleased still has 1 entries, which 0.3.0 would ship without its notes saying so: move them into its section.",
    ]);
    const released = LOG.replace("- **Something new.** Not out yet.\n", "");
    expect(releaseProblems(released, "0.2.0")).toEqual([]);
  });

  test("a tag names its changelog and version", () => {
    expect(logOfTag("v0.4.0")).toEqual({ log: LOGS[0], version: "0.4.0" });
    expect(logOfTag("server-v0.5.0")?.log.file).toBe("packages/server/CHANGELOG.md");
    expect(logOfTag("convex-v0.3.1")?.version).toBe("0.3.1");
    expect(logOfTag("v0.4")).toBeNull();
    expect(logOfTag("nightly")).toBeNull();
  });

  test("which changes need an entry, and where", () => {
    expect(logOfFile("src/claude.ts")).toBe("CHANGELOG.md");
    expect(logOfFile("apps/github/src/bridge.ts")).toBe("CHANGELOG.md");
    expect(logOfFile("packages/server/src/wake.ts")).toBe("packages/server/CHANGELOG.md");
    expect(logOfFile("src/claude.test.ts")).toBeNull();
    expect(logOfFile("packages/server/src/test-db.ts")).toBeNull();
    expect(logOfFile("site/src/content/docs/guides/runs.md")).toBeNull();
  });

  test("an entry is a change under Unreleased, not any edit to the file", () => {
    const typo = LOG.replace("The first release.", "The very first release.");
    expect(unreleasedChanged(LOG, typo)).toBe(false);
    const added = LOG.replace(
      "### Added\n\n- **Something",
      "### Added\n\n- **More.**\n- **Something",
    );
    expect(unreleasedChanged(LOG, added)).toBe(true);
    const wrote = (file: string) => file === "packages/server/CHANGELOG.md";
    expect(
      missingEntries(["src/run.ts", "packages/server/src/wake.ts", "src/run.test.ts"], wrote),
    ).toEqual(["CHANGELOG.md"]);
    expect(missingEntries(["src/run.test.ts", "README.md"], () => false)).toEqual([]);
  });
});

describe("preparing a release", () => {
  test("the next version, by bump or outright", () => {
    expect(nextVersion("0.3.1", "patch")).toBe("0.3.2");
    expect(nextVersion("0.3.1", "minor")).toBe("0.4.0");
    expect(nextVersion("0.3.1", "major")).toBe("1.0.0");
    expect(nextVersion("0.3.1", "0.10.0")).toBe("0.10.0");
    expect(() => nextVersion("0.3.1", "0.3.1")).toThrow("isn't newer");
    expect(() => nextVersion("0.3.1", "v0.4")).toThrow("isn't patch");
  });

  test("Unreleased becomes the version's section, and a release then passes", () => {
    const cut = cutRelease(LOG, "0.3.0", "2026-10-14");
    expect(cut).toContain(
      "## Unreleased\n\n## 0.3.0 — 2026-10-14\n\n### Added\n\n- **Something new.**",
    );
    expect(checkChangelog(cut, "0.3.0")).toEqual([]);
    expect(releaseProblems(cut, "0.3.0")).toEqual([]);
    expect(releaseOf(parseChangelog(cut), "0.3.0")?.groups[0]?.entries[0]?.headline).toBe(
      "Something new.",
    );
  });

  test("nothing to release, or a version already out, is refused", () => {
    const empty = LOG.replace("### Added\n\n- **Something new.** Not out yet.\n", "");
    expect(() => cutRelease(empty, "0.3.0", "2026-10-14")).toThrow("Unreleased is empty");
    expect(() => cutRelease(LOG, "0.2.0", "2026-10-14")).toThrow("already has a section");
  });

  test("package.json keeps everything but its version", () => {
    const manifest =
      '{\n  "name": "x",\n  "version": "0.3.1",\n  "dependencies": { "y": "1.0.0" }\n}\n';
    expect(bumpManifest(manifest, "0.4.0")).toBe(manifest.replace("0.3.1", "0.4.0"));
    expect(() => bumpManifest('{ "name": "x" }', "0.4.0")).toThrow("no version");
  });

  test("the repository's own tooling is never news", () => {
    expect(logOfFile("src/changelog-check.ts")).toBeNull();
    expect(logOfFile("src/changelog.ts")).toBe("CHANGELOG.md");
  });
});

test("this repository's changelogs pass at their packages' versions", async () => {
  const root = join(import.meta.dir, "..");
  for (const log of LOGS) {
    const text = await Bun.file(join(root, log.file)).text();
    const pkg = (await Bun.file(join(root, log.manifest)).json()) as { version: string };
    expect({ file: log.file, problems: checkChangelog(text, pkg.version) }).toEqual({
      file: log.file,
      problems: [],
    });
  }
});
