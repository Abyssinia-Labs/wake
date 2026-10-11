// How the listener is kept running, by platform: a LaunchAgent on macOS, a
// systemd user service on Linux (WAK-6). install, uninstall, update and
// doctor go through this and don't need to know which.
import type { Exec } from "./exec";
import * as launchd from "./launchd";
import * as systemd from "./systemd";

export type Daemon = {
  /** What it is called, for messages: "LaunchAgent", "systemd user service". */
  name: string;
  /** The file that defines it. */
  path: string;
  file(o: { args: string[]; env: Record<string, string>; log: string }): string;
  start(run: Exec): Promise<void>;
  stop(run: Exec): Promise<boolean>;
  restart(run: Exec): Promise<boolean>;
};

export function daemonFor(platform: string = process.platform): Daemon | null {
  if (platform === "darwin") {
    const path = launchd.plistPath();
    return {
      name: "LaunchAgent",
      path,
      file: launchd.plist,
      start: (run) => launchd.load(run, path),
      stop: (run) => launchd.unload(run),
      restart: async (run) =>
        (
          await run([
            "launchctl",
            "kickstart",
            "-k",
            `gui/${process.getuid?.() ?? 0}/${launchd.LABEL}`,
          ])
        ).code === 0,
    };
  }
  if (platform === "linux") {
    return {
      name: "systemd user service",
      path: systemd.unitPath(),
      file: systemd.unit,
      start: systemd.start,
      stop: systemd.stop,
      restart: systemd.restart,
    };
  }
  return null;
}

/** Same as launchd's: Bun and the script, or a compiled binary. */
export const programArguments = launchd.programArguments;
