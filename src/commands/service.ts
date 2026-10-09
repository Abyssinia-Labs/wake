// The LaunchAgent and the pause switch: `install`, `uninstall`, `pause`,
// `resume` and `logs`.
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { keepPrivate, paths } from "../config";
import { exec } from "../exec";
import { load, plist, plistPath, programArguments, unload } from "../launchd";
import { say } from "../log";
import { colorLogLine } from "../log-colors";
import { colorOn, cyan, dim, mark, spin, tildify } from "../ui";

export async function install(): Promise<void> {
  const p = paths();
  await keepPrivate(p);
  const path = plistPath();
  await mkdir(dirname(path), { recursive: true });
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: homedir() };
  if (process.env.WAKE_HOME) env.WAKE_HOME = process.env.WAKE_HOME;
  await Bun.write(
    path,
    plist({ args: programArguments(process.execPath, process.argv[1]), env, log: p.log }),
  );
  await spin("Starting the listener", () => load(exec, path));
  say(`${mark.ok()} Wake is listening, and will start at every login`);
  say(dim(`  Its log: ${tildify(p.log)}. Follow it with wakectl logs -f.`));
}

export async function uninstall(): Promise<void> {
  const stopped = await spin("Stopping the listener", () => unload(exec));
  await rm(plistPath(), { force: true });
  say(
    stopped
      ? `${mark.ok()} Wake stopped, and won't start at login`
      : `${mark.warn()} Wake wasn't running. ${dim("Nothing will start it at login now.")}`,
  );
}

export async function pause(): Promise<void> {
  const p = paths();
  await mkdir(p.home, { recursive: true });
  await Bun.write(p.paused, `${new Date().toISOString()}\n`);
  say(`${mark.warn()} Paused: Wake claims nothing new`);
  say(dim(`  A run already going finishes. ${cyan("wakectl resume")} to go on.`));
}

export async function resume(): Promise<void> {
  await rm(paths().paused, { force: true });
  say(`${mark.ok()} Resumed ${dim("Wake looks again within half a minute.")}`);
}

/** The listener's log; in a terminal each line is coloured on its way out. */
export async function logs(follow: boolean): Promise<void> {
  const args = ["tail", "-n", "50", ...(follow ? ["-f"] : []), paths().log];
  if (!colorOn()) {
    await Bun.spawn(args, { stdout: "inherit", stderr: "inherit" }).exited;
    return;
  }
  const proc = Bun.spawn(args, { stdout: "pipe", stderr: "inherit" });
  const decoder = new TextDecoder();
  let rest = "";
  for await (const chunk of proc.stdout) {
    rest += decoder.decode(chunk, { stream: true });
    const lines = rest.split("\n");
    rest = lines.pop() ?? "";
    for (const line of lines) process.stdout.write(`${colorLogLine(line)}\n`);
  }
  if (rest) process.stdout.write(`${colorLogLine(rest)}\n`);
  await proc.exited;
}
