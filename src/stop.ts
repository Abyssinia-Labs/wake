// `wakectl stop <name>`, both halves. The command leaves a request named for
// the run's summons in Wake's folder and wakes the listener with SIGUSR2; the
// listener takes the requests and aborts those runs (run.ts), and the app is
// told the run couldn't finish, with `STOPPED` as the reason. A file rather
// than a socket: the listener already owns Wake's folder, and a request
// made while it restarts is still there when it is back.
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunState } from "./state";

/** What the app shows for a run its owner stopped. */
export const STOPPED = "Stopped by its owner.";

// The contract's guard for an id (contract.ts), so a request can't name a path.
const ID = /^[A-Za-z0-9_-]{1,128}$/;

export async function requestStop(dir: string, summons: string): Promise<void> {
  if (!ID.test(summons)) throw new Error(`"${summons}" isn't a summons id.`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, summons), "", { mode: 0o600 });
}

/** The summonses asked to stop, each request removed as it is taken. */
export async function takeStops(dir: string): Promise<string[]> {
  const names = await readdir(dir).catch(() => [] as string[]);
  const ids = names.filter((name) => ID.test(name));
  await Promise.all(names.map((name) => rm(join(dir, name), { force: true })));
  return ids;
}

/** A run going now, by its name, its ticket or its session id. */
export function findRunning(runs: readonly RunState[], wanted: string): RunState | undefined {
  const key = wanted.trim().toLowerCase();
  return runs.find(
    (run) =>
      run.name === key ||
      run.ref.toLowerCase() === key ||
      (run.sessionId !== "" && run.sessionId.toLowerCase() === key),
  );
}
