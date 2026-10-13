import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json";
import { forTerminal, installedNotes, whatsNew } from "./whats-new";

const LOG = `# Changelog

## Unreleased

### Added

- **Not out yet.**

## 0.3.0 — 2026-10-12

### Added

- **Pick the model each agent runs with.** \`wakectl model claude opus\`.

### Security

- **Runs are fenced.**

## 0.2.0 — 2026-10-11

### Fixed

- **\`wakectl status\` fits a longer domain.**

## 0.1.0 — 2026-10-09

### Added

- **The first release.**
`;

let dir = "";
beforeAll(async () => {
  process.env.NO_COLOR = "1";
  dir = await mkdtemp(join(tmpdir(), "wake-news-"));
});
afterAll(async () => {
  delete process.env.NO_COLOR;
  await rm(dir, { recursive: true, force: true });
});

test("every release since the old version, newest first, headlines only", () => {
  expect(whatsNew(LOG, "0.1.0", "0.3.0")).toEqual([
    "What's new since 0.1.0",
    "  0.3.0  2026-10-12",
    "    Pick the model each agent runs with.",
    "    security Runs are fenced.",
    "  0.2.0  2026-10-11",
    "    wakectl status fits a longer domain.",
    "  All of it: https://wakectl.dev/changelog/#v0-3-0",
  ]);
});

test("nothing between the two says nothing, and Unreleased is never news", () => {
  expect(whatsNew(LOG, "0.3.0", "0.3.0")).toEqual([]);
  expect(whatsNew(LOG, "0.3.0", "0.4.0")).toEqual([]);
});

test("without the notes, the link alone", () => {
  expect(whatsNew(null, "0.1.0", "0.3.0")).toEqual(["What's new · https://wakectl.dev/changelog/"]);
});

test("a long gap lists twelve and counts the rest", () => {
  const many = Array.from({ length: 15 }, (_, i) => `- **Change ${i + 1}.**`).join("\n");
  const log = `## Unreleased\n\n## 0.9.0 — 2026-10-20\n\n### Added\n\n${many}\n\n## 0.8.0 — 2026-10-19\n\n### Fixed\n\n- **One more.**\n`;
  const lines = whatsNew(log, "0.7.0", "0.9.0");
  expect(lines.filter((line) => line.startsWith("    Change"))).toHaveLength(12);
  expect(lines).toContain("    and 4 more");
  expect(lines.join("\n")).not.toContain("0.8.0");
});

test("Markdown reads as plain words, and nothing in it reaches the terminal raw", () => {
  expect(forTerminal("**Bold** with `code` and [a link](https://x.dev)")).toBe(
    "Bold with code and a link",
  );
  expect(forTerminal("a\u001b[2Jb")).toBe("a�[2Jb");
});

test("the notes are read from beside the installed package's src/", async () => {
  const root = join(dir, "node_modules", "@abyssinia-labs", "wake");
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "CHANGELOG.md"), LOG);
  expect(await installedNotes(join(root, "src", "cli.ts"))).toBe(LOG);
  expect(await installedNotes(join(dir, "elsewhere", "src", "cli.ts"))).toBeNull();
  expect(await installedNotes("/usr/local/bin/wakectl")).toBeNull();
});

test("the package ships its changelog, which update reads", () => {
  expect(pkg.files).toContain("CHANGELOG.md");
});
