// `wakectl update`: the newest @abyssinia-labs/wake from npm, and the
// listener restarted onto it. A copy run from a checkout of the repository
// is the person's to update with git, so it is told so and left alone.
import { readFile } from "node:fs/promises";
import pkg from "../../package.json";
import { paths } from "../config";
import { type Exec, exec } from "../exec";
import { LABEL, plistPath } from "../launchd";
import { say } from "../log";
import { isAlive, readState } from "../state";
import { bold, cyan, dim, mark, spin, tildify } from "../ui";

const PACKAGE = "@abyssinia-labs/wake";
const GLOBAL_MARK = `/install/global/node_modules/${PACKAGE}/`;
const VERSION = /^\d+\.\d+\.\d+$/;

/** A global Bun install, or a checkout of the repository. */
export function installKindOf(script: string | undefined): "global" | "source" {
  return script?.includes(GLOBAL_MARK) ? "global" : "source";
}

/** Whether `latest` is newer than `current`, part by part. */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.split(".").map(Number);
  const b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export async function latestVersion(fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(
    `https://registry.npmjs.org/-/package/${PACKAGE.replace("/", "%2f")}/dist-tags`,
  );
  if (!res.ok) throw new Error(`npm answered ${res.status}.`);
  const tags: unknown = await res.json();
  const latest =
    typeof tags === "object" && tags !== null ? (tags as Record<string, unknown>).latest : null;
  if (typeof latest !== "string" || !VERSION.test(latest))
    throw new Error("npm named no latest version.");
  return latest;
}

/** Restarts the listener when it runs this install and nothing is running; says what it did. */
async function restartListener(run: Exec, script: string): Promise<void> {
  let plist = "";
  try {
    plist = await readFile(plistPath(), "utf8");
  } catch {
    say(dim(`  The listener isn't installed: ${cyan("wakectl install")} starts it.`));
    return;
  }
  if (!plist.includes(script)) {
    say(
      dim(
        `  Your listener runs another copy of Wake; ${cyan("wakectl install")} moves it onto this one.`,
      ),
    );
    return;
  }
  const state = await readState(paths().state);
  const busy = state && isAlive(state.pid) ? state.runs.length : 0;
  if (busy > 0) {
    say(
      dim(
        `  ${busy} run${busy === 1 ? " is" : "s are"} going: restart later with ${cyan("wakectl install")}.`,
      ),
    );
    return;
  }
  await spin("Restarting the listener", () =>
    run(["launchctl", "kickstart", "-k", `gui/${process.getuid?.() ?? 0}/${LABEL}`]),
  );
  say(`${mark.ok()} The listener runs the new version`);
}

export async function update(run: Exec = exec): Promise<void> {
  const script = process.argv[1];
  const current = pkg.version;
  const latest = await spin("Asking npm for the latest Wake", () => latestVersion());
  if (installKindOf(script) === "source") {
    say(
      `${mark.warn()} This wakectl runs from a checkout (${tildify(script ?? "?")}), at ${current}; npm has ${latest}.`,
    );
    say(dim(`  Update it there with git pull, or install the package: bun add -g ${PACKAGE}`));
    return;
  }
  if (!isNewer(latest, current)) {
    say(`${mark.ok()} Wake ${bold(current)} is the latest`);
    return;
  }
  const result = await spin(`Installing Wake ${latest}`, () =>
    run(["bun", "add", "-g", `${PACKAGE}@${latest}`]),
  );
  if (result.code !== 0) {
    throw new Error(
      `bun add failed: ${(result.stderr || result.stdout).trim().split("\n").at(-1) ?? ""}`,
    );
  }
  say(`${mark.ok()} Updated Wake ${current} → ${bold(latest)}`);
  if (script) await restartListener(run, script);
}
