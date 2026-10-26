// How the hero's run prints its steps, as Wake for Mac prints them
// (WakeKit's PrintQueue): an LCD can't fade or glide, so each step types out
// at the pace of its kind, and steps that land close together each print
// in time for the next. Everything on the hero's screen is a function of
// one clock, t seconds into the run.

export type StepKind = "wake" | "tool" | "said";
export type RunStep = { at: number; clock: string; kind: StepKind; line: string };
export type Printed = RunStep & { duration: number; end: number };

/** How long a line of its kind prints on its own, in seconds. */
function natural({ kind, line }: RunStep): number {
  if (kind === "said") return Math.min(1.5, line.length / 50);
  if (kind === "tool") return 0.15;
  return Math.min(0.45, line.length / 80);
}

/** Each step's printing, squeezed to finish before the next lands. */
export function schedule(steps: RunStep[]): Printed[] {
  const sorted = [...steps].sort((a, b) => a.at - b.at);
  return sorted.map((step, index) => {
    const next = sorted[index + 1];
    const room = next ? Math.max(0.05, (next.at - step.at) * 0.8) : Number.POSITIVE_INFINITY;
    const duration = Math.min(natural(step), room);
    return { ...step, duration, end: step.at + duration };
  });
}

/**
 * How much of a step shows at `t`: a tool call in three strokes, what was
 * said word by word, Wake's own lines a character at a time.
 */
export function typed(step: Printed, t: number): string {
  const { line, kind, at, duration, end } = step;
  if (t >= end || duration === 0) return line;
  const done = Math.max(0, (t - at) / duration);
  if (kind === "tool") return line.slice(0, Math.ceil(line.length * (Math.ceil(done * 3) / 3)));
  if (kind === "said") {
    const words = line.split(" ");
    return words.slice(0, Math.ceil(words.length * done)).join(" ");
  }
  return line.slice(0, Math.ceil(line.length * done));
}

/** From 1 as a step lands to 0 half a second after it printed: its ink's longer ghost. */
export function fresh(step: Printed, t: number): number {
  return Math.max(0, Math.min(1, 1 - (t - step.end) / 0.5));
}
