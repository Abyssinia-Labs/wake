// How the listener is kept running, by platform: a LaunchAgent on macOS, a
// systemd user service on Linux (WAK-6). install, uninstall, update and
// doctor go through this and don't need to know which.
import type { Exec } from "./exec";
import type { AppAgent } from "./launchd";
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
  /**
   * An app that registered the listener itself (macOS's SMAppService), or
   * null. Its start at login is the app's setting, so install and uninstall
   * leave it alone; Linux has none.
   */
  appAgent(run: Exec): Promise<AppAgent | null>;
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
      appAgent: launchd.appAgent,
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
      appAgent: async () => null,
    };
  }
  return null;
}

/** What install, uninstall, doctor and the rest say when an app runs the listener. */
export function appRunsIt(agent: AppAgent): string {
  return `An app on this Mac runs the listener${agent.app ? ` (${agent.app})` : ""}`;
}

/** Same as launchd's: Bun and the script, or a compiled binary. */
export const programArguments = launchd.programArguments;
