// What a run has done, kept on this machine: the same steps the log gets
// (claude-events.ts, the herdr and runner notes), one JSON object a line in
// `runs/<app>.<summons>.ndjson` in Wake's folder, so a program that drives
// wakectl can show one run's steps without reading the whole log. The
// folder is its owner's alone, nothing sends it anywhere (a step can carry
// a path or a command, which stay on the machine), and a run's file goes
// when the history (history.ts) lets the run go. Keyed by app and summons,
// not by name: with 4,096 names, two of the last 200 runs likely share one.
import { appendFile, mkdir, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { plain } from "./log";

export type Step = { at: number; line: string };

/** A run's file. App names and summons ids are guarded (contract.ts) to `[A-Za-z0-9_-]`, so neither can climb out. */
export function activityFile(dir: string, app: string, summons: string): string {
  return join(dir, `${app}.${summons}.ndjson`);
}

export type Activity = {
  /** Adds a step to the run's file, after any still being written, so they keep their order. */
  append: (app: string, summons: string, line: string) => Promise<void>;
  /** Removes every run's file but those named, as `app.summons`. */
  prune: (keep: readonly { app: string; summons: string }[]) => Promise<number>;
};

export function activityIn(dir: string, now: () => number = Date.now): Activity {
  const pending = new Map<string, Promise<void>>();
  return {
    append(app, summons, line) {
      const file = activityFile(dir, app, summons);
      const step: Step = { at: now(), line: plain(line) };
      const write = async (): Promise<void> => {
        await mkdir(dir, { recursive: true, mode: 0o700 });
        await appendFile(file, `${JSON.stringify(step)}\n`, { mode: 0o600 });
      };
      const next = (pending.get(file) ?? Promise.resolve()).then(write, write);
      pending.set(file, next);
      return next.finally(() => {
        if (pending.get(file) === next) pending.delete(file);
      });
    },
    async prune(keep) {
      const kept = new Set(keep.map((run) => `${run.app}.${run.summons}.ndjson`));
      const names = await readdir(dir).catch(() => [] as string[]);
      const gone = names.filter((name) => name.endsWith(".ndjson") && !kept.has(name));
      await Promise.all(gone.map((name) => rm(join(dir, name), { force: true })));
      return gone.length;
    },
  };
}

/** A run's steps, oldest first; lines that are not a step are skipped. */
export async function readActivity(file: string): Promise<Step[]> {
  const text = await readFile(file, "utf8").catch(() => "");
  const steps: Step[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    try {
      const step: unknown = JSON.parse(raw);
      if (
        typeof step === "object" &&
        step !== null &&
        "at" in step &&
        "line" in step &&
        typeof step.at === "number" &&
        typeof step.line === "string"
      ) {
        steps.push({ at: step.at, line: step.line });
      }
    } catch {
      // A line cut short by a crash mid-write: the rest of the file still reads.
    }
  }
  return steps;
}
