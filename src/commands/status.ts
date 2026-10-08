// `wakectl status`: what is paired, whether the listener is running and
// connected, and what it is running now.
import { existsSync } from "node:fs";
import { loadConfig, paths } from "../config";
import { say } from "../log";
import { isAlive, readState } from "../state";

function ago(at: number, now: number): string {
  const minutes = Math.round((now - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.round(minutes / 60)} h ago`;
}

export async function status(): Promise<void> {
  const p = paths();
  const config = await loadConfig();
  const state = await readState(p.state);
  const now = Date.now();
  const running = state !== null && isAlive(state.pid);

  say(running ? `Wake is running (pid ${state.pid}).` : "Wake is not running: `wakectl install`.");
  if (existsSync(p.paused)) say("Paused: nothing new is claimed. `wakectl resume` to go on.");

  const apps = Object.values(config.apps);
  if (apps.length === 0) say("Nothing paired: ask your agent to pair Wake, or run `wakectl pair`.");
  for (const app of apps) {
    const live = running ? state.apps[app.domain] : undefined;
    const line = !live
      ? "not connected"
      : live.unpaired
        ? "refused: pair it again"
        : live.connected
          ? "listening"
          : "connecting";
    say(`  ${app.domain}  ${app.agent.name}  ${line}`);
  }

  if (running && state.runs.length > 0) {
    say("Running now:");
    for (const run of state.runs) {
      say(`  ${run.ref}  started ${ago(run.startedAt, now)}  claude --resume ${run.sessionId}`);
      say(`    in ${run.cwd}`);
    }
  }
  say(`Looks for clones in: ${config.roots.join(", ")}`);
}
