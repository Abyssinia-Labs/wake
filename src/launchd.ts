// The listener runs as a LaunchAgent, so it starts at login and comes back
// if it stops. launchd starts it with almost no PATH, so the PATH of the
// shell that ran `wakectl install` is written into the plist: that is where
// `claude`, `git` and `gh` were found.
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { Exec } from "./exec";

export const LABEL = "dev.abyssinia.wake";

export function plistPath(): string {
  return join(homedir(), "Library", "LaunchAgents", `${LABEL}.plist`);
}

/** How launchd should start `wakectl listen`: a compiled binary, or Bun and the script. */
export function programArguments(execPath: string, script: string | undefined): string[] {
  const viaBun = basename(execPath) === "bun" || basename(execPath) === "bun-debug";
  if (viaBun && script) return [execPath, script, "listen"];
  return [execPath, "listen"];
}

function xml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function plist(o: { args: string[]; env: Record<string, string>; log: string }): string {
  const args = o.args.map((a) => `    <string>${xml(a)}</string>`).join("\n");
  const env = Object.entries(o.env)
    .map(([k, v]) => `    <key>${xml(k)}</key>\n    <string>${xml(v)}</string>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>EnvironmentVariables</key>
  <dict>
${env}
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xml(o.log)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(o.log)}</string>
</dict>
</plist>
`;
}

function domain(): string {
  return `gui/${process.getuid?.() ?? 0}`;
}

export async function load(run: Exec, path: string): Promise<void> {
  // Replacing a loaded agent means unloading it first; not loaded is fine.
  await run(["launchctl", "bootout", `${domain()}/${LABEL}`]);
  const result = await run(["launchctl", "bootstrap", domain(), path]);
  if (result.code !== 0) throw new Error(`launchctl bootstrap failed: ${result.stderr.trim()}`);
}

export async function unload(run: Exec): Promise<boolean> {
  return (await run(["launchctl", "bootout", `${domain()}/${LABEL}`])).code === 0;
}
