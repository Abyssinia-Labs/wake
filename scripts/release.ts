// `bun run release <patch|minor|major|X.Y.Z> [--package convex|server]`:
// prepares a release on a branch of its own. Unreleased becomes the
// version's dated section, package.json takes the version, bun.lock follows,
// and it's one commit. It pushes nothing: main takes it through a pull
// request, a person pushes the tag, and the release workflow publishes
// from it after its notes job passes (CLAUDE.md: never publish from a machine).
import { join } from "node:path";
import { parseArgs } from "node:util";
import { notesOf, parseChangelog, releaseOf } from "../src/changelog";
import {
  bumpManifest,
  checkChangelog,
  cutRelease,
  LOGS,
  nextVersion,
  releaseProblems,
} from "../src/changelog-check";
import { say, warn } from "../src/log";

const root = join(import.meta.dir, "..");
const NAMES = { v: "wakectl", "convex-v": "wake-convex", "server-v": "wake-server" } as const;

function run(cmd: string[]): string {
  const result = Bun.spawnSync(cmd, { cwd: root, stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`${cmd.join(" ")} failed: ${result.stderr.toString().trim()}`);
  }
  return result.stdout.toString().trim();
}

function today(): string {
  const now = new Date();
  const two = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { package: { type: "string" } },
  });
  const [wanted] = positionals;
  const log = LOGS.find((one) =>
    values.package ? one.file === `packages/${values.package}/CHANGELOG.md` : one.tag === "v",
  );
  if (!wanted || !log) {
    throw new Error("usage: bun run release <patch|minor|major|X.Y.Z> [--package convex|server]");
  }

  // From an up-to-date main with nothing else in the tree, so the release is what main has.
  if (run(["git", "status", "--porcelain"]))
    throw new Error("Commit or set aside your changes first.");
  if (run(["git", "rev-parse", "--abbrev-ref", "HEAD"]) !== "main") {
    throw new Error("Prepare a release from main.");
  }
  run(["git", "fetch", "--quiet", "origin", "main"]);
  if (run(["git", "rev-parse", "HEAD"]) !== run(["git", "rev-parse", "origin/main"])) {
    throw new Error("main isn't origin/main: pull first.");
  }

  const manifest = await Bun.file(join(root, log.manifest)).text();
  const current = (JSON.parse(manifest) as { version: string }).version;
  const version = nextVersion(current, wanted);
  const tag = `${log.tag}${version}`;
  const text = cutRelease(await Bun.file(join(root, log.file)).text(), version, today());
  const problems = [...checkChangelog(text, version), ...releaseProblems(text, version)];
  if (problems.length > 0) throw new Error(`The release wouldn't pass: ${problems.join(" ")}`);

  run(["git", "switch", "--quiet", "-c", `release-${tag}`]);
  await Bun.write(join(root, log.file), text);
  await Bun.write(join(root, log.manifest), bumpManifest(manifest, version));
  // bun.lock records each workspace package's version, and CI installs frozen.
  run(["bun", "install", "--ignore-scripts"]);
  run(["git", "add", log.file, log.manifest, "bun.lock"]);
  const name = NAMES[log.tag];
  run(["git", "commit", "--quiet", "-m", `Release ${name} ${version}`]);

  const notes = releaseOf(parseChangelog(text), version);
  say(`Prepared ${name} ${version} (${current} → ${version}) on release-${tag}.\n`);
  if (notes) say(`${notesOf(notes)}\n`);
  say(
    [
      "Next:",
      `  git push -u origin release-${tag}`,
      `  gh pr create --fill`,
      "Once it's merged:",
      "  git switch main && git pull",
      `  git tag ${tag} && git push origin ${tag}`,
      "Then approve the npm environment on the run's page, where its notes are.",
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  warn(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
