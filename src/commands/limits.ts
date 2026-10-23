// `wakectl limits [runs <1|2>] [stop-after <minutes>]`: how many runs go at
// once and how long one may take before Wake stops it. Each writes the
// config the listener reads every half minute, so it takes with no
// restart. At most two runs at once is the pattern's ("What a run may do").
import { type Config, loadConfig, saveConfig } from "../config";
import { say } from "../log";
import { bold, cyan, dim, mark } from "../ui";

const USAGE = "usage: wakectl limits [runs <1|2>] [stop-after <minutes>]";
/** The pattern's ceiling on runs going at once. */
export const MOST_RUNS = 2;
/** A day: past that, a run that hasn't finished is stuck. */
export const LONGEST_MINUTES = 24 * 60;

export function limitsLines(config: Pick<Config, "maxRuns" | "runTimeoutMinutes">): string[] {
  return [
    `At most ${bold(String(config.maxRuns))} run${config.maxRuns === 1 ? "" : "s"} at once; a run is stopped after ${bold(`${config.runTimeoutMinutes} min`)}`,
    dim(
      `  Change with ${cyan("wakectl limits runs 1")} or ${cyan("wakectl limits stop-after 90")}.`,
    ),
  ];
}

/** A whole number from `from` to `to`, or why not. */
function whole(given: string, from: number, to: number, what: string): number {
  const n = Number(given);
  if (!/^\d+$/.test(given) || n < from || n > to) {
    throw new Error(`${what} is a whole number from ${from} to ${to}, not "${given}".`);
  }
  return n;
}

/** The config after one limit is changed. */
export function nextLimits(config: Config, which: string, given: string): Config {
  if (which === "runs") return { ...config, maxRuns: whole(given, 1, MOST_RUNS, "Runs at once") };
  if (which === "stop-after") {
    return {
      ...config,
      runTimeoutMinutes: whole(given, 1, LONGEST_MINUTES, "Minutes before a run is stopped"),
    };
  }
  throw new Error(USAGE);
}

export async function limits(which: string | undefined, given: string | undefined): Promise<void> {
  const config = await loadConfig();
  if (which === undefined) return say(limitsLines(config).join("\n"));
  if (given === undefined) throw new Error(USAGE);
  const next = nextLimits(config, which, given);
  await saveConfig(next);
  say(
    which === "runs"
      ? `${mark.ok()} At most ${bold(String(next.maxRuns))} run${next.maxRuns === 1 ? "" : "s"} at once, from the next claim`
      : `${mark.ok()} A run is stopped after ${bold(`${next.runTimeoutMinutes} min`)}, from the next run`,
  );
}
