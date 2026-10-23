// `wakectl stop <name>`: ends a run going on this machine, found by its
// name, its ticket or its session id. The listener ends the tool (or
// interrupts it in herdr, keeping the tab) and tells the app the run
// couldn't finish because its owner stopped it (stop.ts).
import { paths } from "../config";
import { findRun, readHistory } from "../history";
import { say } from "../log";
import { isAlive, readState } from "../state";
import { findRunning, requestStop } from "../stop";
import { bold, cyan, dim, mark } from "../ui";

const WAIT_MS = 10_000;
const STEP_MS = 500;

export async function stop(
  wanted: string,
  pause: (ms: number) => Promise<unknown> = Bun.sleep,
): Promise<void> {
  const p = paths();
  const state = await readState(p.state);
  if (!state || !isAlive(state.pid)) {
    throw new Error("Wake isn't listening, so nothing is running to stop.");
  }
  const run = findRunning(state.runs, wanted);
  if (!run) {
    const past = findRun(await readHistory(p.history), wanted);
    throw new Error(
      past
        ? `${past.name} isn't running: it ${past.outcome === "failed" ? "couldn't finish" : "has ended"}.`
        : `Nothing called ${wanted} is running here; wakectl status lists what is.`,
    );
  }
  const label = run.name ?? run.ref;
  // An older listener names no summons, and would take the signal as a reason to quit.
  if (!run.summons) {
    throw new Error(
      `${label} was started by an older Wake, which can't stop it this way. ${cyan("wakectl update")} brings the listener up to date.`,
    );
  }
  await requestStop(p.stops, run.summons);
  process.kill(state.pid, "SIGUSR2");
  for (let waited = 0; waited < WAIT_MS; waited += STEP_MS) {
    await pause(STEP_MS);
    const now = await readState(p.state);
    if (!now?.runs.some((one) => one.summons === run.summons)) {
      say(`${mark.ok()} Stopped ${bold(label)} (${run.ref}). The app shows it couldn't finish.`);
      return;
    }
  }
  say(
    `${mark.warn()} Asked ${bold(label)} to stop; the listener hasn't ended it yet. ${dim("wakectl status shows when it has.")}`,
  );
}
