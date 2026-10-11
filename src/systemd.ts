// On Linux the listener is a systemd user service, as it is a LaunchAgent on
// macOS (WAK-6): started at login, back if it stops, its PATH the one of the
// shell that ran `wakectl install`. A user service stops at logout unless
// the user lingers (`loginctl enable-linger`), which doctor checks.
import { homedir } from "node:os";
import { join } from "node:path";
import type { Exec } from "./exec";

export const UNIT = "wake.service";

export function unitPath(env: NodeJS.ProcessEnv = process.env): string {
  const config = env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(config, "systemd", "user", UNIT);
}

/** systemd's quoting for one word of ExecStart or Environment: double quotes, backslash escapes. */
function quoted(word: string): string {
  return `"${word.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
}

export function unit(o: { args: string[]; env: Record<string, string>; log: string }): string {
  const env = Object.entries(o.env)
    .map(([k, v]) => `Environment=${quoted(`${k}=${v}`)}`)
    .join("\n");
  return `[Unit]
Description=Wake: starts your coding agent when an app hands it work
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${o.args.map(quoted).join(" ")}
${env}
Restart=always
RestartSec=10
StandardOutput=append:${o.log}
StandardError=append:${o.log}

[Install]
WantedBy=default.target
`;
}

async function systemctl(run: Exec, args: string[]) {
  return await run(["systemctl", "--user", ...args]);
}

export async function start(run: Exec): Promise<void> {
  await systemctl(run, ["daemon-reload"]);
  const enabled = await systemctl(run, ["enable", UNIT]);
  if (enabled.code !== 0)
    throw new Error(`systemctl --user enable failed: ${enabled.stderr.trim()}`);
  // Restart, not start, so a reinstall picks up a new unit.
  const restarted = await systemctl(run, ["restart", UNIT]);
  if (restarted.code !== 0) {
    throw new Error(`systemctl --user restart failed: ${restarted.stderr.trim()}`);
  }
}

export async function stop(run: Exec): Promise<boolean> {
  const stopped = (await systemctl(run, ["disable", "--now", UNIT])).code === 0;
  await systemctl(run, ["daemon-reload"]);
  return stopped;
}

export async function restart(run: Exec): Promise<boolean> {
  return (await systemctl(run, ["restart", UNIT])).code === 0;
}

/** Whether the user's services keep running after they log out. */
export async function lingers(run: Exec, user = process.env.USER ?? ""): Promise<boolean> {
  const shown = await run(["loginctl", "show-user", user, "--property=Linger"]);
  return shown.code === 0 && shown.stdout.trim() === "Linger=yes";
}
