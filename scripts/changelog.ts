// `bun run changelog <check|pr|release>`: what CI runs to hold the changelogs
// to their format, a pull request to its entry, and a release to its notes.
// The rules are src/changelog-check.ts, tested there.
import { join } from "node:path";
import { notesOf, parseChangelog, releaseOf } from "../src/changelog";
import {
  checkChangelog,
  LOGS,
  logOfTag,
  missingEntries,
  releaseProblems,
  unreleasedChanged,
} from "../src/changelog-check";
import { say, warn } from "../src/log";

const root = join(import.meta.dir, "..");
const read = (path: string) => Bun.file(join(root, path)).text();

async function versionOf(manifest: string): Promise<string> {
  const pkg: unknown = await Bun.file(join(root, manifest)).json();
  const version = (pkg as { version?: unknown }).version;
  if (typeof version !== "string") throw new Error(`${manifest} has no version.`);
  return version;
}

function git(args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: root });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.toString();
}

function fail(title: string, problems: string[]): never {
  warn(title);
  for (const problem of problems) warn(`  - ${problem}`);
  process.exit(1);
}

/** Every changelog against its format and its package's version. */
async function check(): Promise<void> {
  const problems: string[] = [];
  for (const log of LOGS) {
    const found = checkChangelog(await read(log.file), await versionOf(log.manifest));
    problems.push(...found.map((one) => `${log.file}: ${one}`));
  }
  if (problems.length > 0) fail("The changelogs don't pass:", problems);
  say("The changelogs pass.");
}

/** A pull request's changes against the base it merges into. */
function pr(base: string): void {
  const changed = git(["diff", "--name-only", `${base}...HEAD`])
    .split("\n")
    .filter(Boolean);
  // A file a side doesn't have reads as empty.
  const at = (rev: string, file: string) => {
    try {
      return git(["show", `${rev}:${file}`]);
    } catch {
      return "";
    }
  };
  const missing = missingEntries(changed, (file) =>
    unreleasedChanged(at(base, file), at("HEAD", file)),
  );
  if (missing.length === 0) {
    say("Each change that needs an entry has one.");
    return;
  }
  fail("This pull request changes what people use, with nothing under Unreleased for it:", [
    ...missing.map((file) => `${file}: add an entry under "## Unreleased"`),
    'An entry is "- **A headline that stands alone.** What it means for the person.", under ### Added, Changed, Deprecated, Removed, Fixed or Security.',
    'Nothing anyone would notice (a refactor, tests)? A person adds the "no changelog" label.',
  ]);
}

/** The gate before publishing a tag: its notes, printed for the release, or why not. */
async function release(tag: string): Promise<void> {
  const of = logOfTag(tag);
  if (!of) fail(`${tag} isn't a release tag:`, ["v1.2.3, convex-v1.2.3 or server-v1.2.3"]);
  const text = await read(of.log.file);
  const problems = releaseProblems(text, of.version);
  if (problems.length > 0) fail(`${tag} can't be released yet (${of.log.file}):`, problems);
  const notes = releaseOf(parseChangelog(text), of.version);
  if (notes) say(notesOf(notes));
}

const [command, arg] = process.argv.slice(2);
if (command === "check") await check();
else if (command === "pr" && arg) pr(arg);
else if (command === "release" && arg) await release(arg);
else
  fail("usage:", [
    "bun run changelog check",
    "bun run changelog pr <base sha>",
    "bun run changelog release <tag>",
  ]);
