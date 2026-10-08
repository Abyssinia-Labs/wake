// The LaunchAgent and the pause switch: `install`, `uninstall`, `pause`,
// `resume` and `logs`.
import { mkdir, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { paths } from "../config";
import { exec } from "../exec";
import { load, plist, plistPath, programArguments, unload } from "../launchd";
import { say } from "../log";

export async function install(): Promise<void> {
  const p = paths();
  await mkdir(dirname(p.log), { recursive: true });
  const path = plistPath();
  await mkdir(dirname(path), { recursive: true });
  const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: homedir() };
  if (process.env.WAKE_HOME) env.WAKE_HOME = process.env.WAKE_HOME;
  await Bun.write(
    path,
    plist({ args: programArguments(process.execPath, process.argv[1]), env, log: p.log }),
  );
  await load(exec, path);
  say(`Wake is running, and will start at every login. Its log: ${p.log}`);
}

export async function uninstall(): Promise<void> {
  const stopped = await unload(exec);
  await rm(plistPath(), { force: true });
  say(stopped ? "Wake stopped and won't start at login." : "Wake wasn't running.");
}

export async function pause(): Promise<void> {
  const p = paths();
  await mkdir(p.home, { recursive: true });
  await Bun.write(p.paused, `${new Date().toISOString()}\n`);
  say("Paused: Wake claims nothing new. A run already going finishes. `wakectl resume` to go on.");
}

export async function resume(): Promise<void> {
  await rm(paths().paused, { force: true });
  say("Resumed. Wake looks again within half a minute.");
}

export async function logs(follow: boolean): Promise<void> {
  const args = ["tail", "-n", "50", ...(follow ? ["-f"] : []), paths().log];
  const proc = Bun.spawn(args, { stdout: "inherit", stderr: "inherit" });
  await proc.exited;
}
