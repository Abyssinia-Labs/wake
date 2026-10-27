// The hero's night (the canvas's "The burrow at night"): a burrow for each
// person's machine, a creature asleep in each. A summons falls from the sky
// and down one hole; the creature wakes, works, and sends a pull request up
// to the surface as a flag. Each flag brings the dawn on, until every flag
// stands and the night starts again. Everything here is a pure function of
// t, seconds since the hero first played, so it is tested without a canvas.

export type Creature = "lark" | "otter" | "owl" | "heron" | "finch" | "critter";
export type Phase = "asleep" | "falling" | "waking" | "working" | "rising" | "done";

export interface Burrow {
  who: string;
  run: string;
  creature: Creature;
  ask: string;
  pr: string;
  steps: [string, string, string];
}

export interface Run extends Burrow {
  /** Seconds since its summons left, negative before. */
  r: number;
  phase: Phase;
}

export interface Night {
  /** Seconds into this night, and which night it is. */
  u: number;
  loop: number;
  runs: Run[];
  /** Flags standing, and how far toward morning the sky is (0 to 1). */
  planted: number;
  dawn: number;
  /** As night falls again, the flags come down (0 to 1). */
  reset: number;
}

/** One night, in seconds. */
export const NIGHT = 18;
/** Where a still picture holds: three flags up, two creatures at work. */
export const STILL = 11.2;

export const BURROWS: Burrow[] = [
  {
    who: "ada's MacBook Pro",
    run: "brisk-lark",
    creature: "lark",
    ask: "label: wake",
    pr: "#215",
    steps: ["Read date-picker.ts", "Edit week-grid.tsx", "bun test: 14 passed"],
  },
  {
    who: "sam's ThinkPad",
    run: "quiet-otter",
    creature: "otter",
    ask: "@agent fix the CSV export",
    pr: "#88",
    steps: ["Read the thread", "Edit src/export.ts", "gh pr create"],
  },
  {
    who: "mo's Mac mini",
    run: "sleepy-owl",
    creature: "owl",
    ask: "/wake in a review",
    pr: "#301",
    steps: ["Read the review", "Edit api/limits.ts", "cargo test: ok"],
  },
  {
    who: "lee's MacBook Air",
    run: "amber-heron",
    creature: "heron",
    ask: "assigned a ticket",
    pr: "#42",
    steps: ["Read the ticket", "Edit billing.tsx", "pnpm test: ok"],
  },
  {
    who: "kai's desktop",
    run: "keen-finch",
    creature: "finch",
    ask: "@agent triage this",
    pr: "#77",
    steps: ["gh issue list", "Label 6, reply to 2", "gh pr create"],
  },
  {
    who: "jo's MacBook Pro",
    run: "calm-wombat",
    creature: "critter",
    ask: "/wake codex",
    pr: "#19",
    steps: ["Read docs/setup.md", "Edit README.md", "gh pr create"],
  },
];

// When each burrow's summons leaves in a night, so the flags go up out of
// order across the ground.
const STARTS = [0.6, 4.0, 7.0, 2.4, 8.4, 5.6];

/** What a run is doing r seconds after its summons left. */
export function phaseOf(r: number): Phase {
  if (r < 0) return "asleep";
  if (r < 1.6) return "falling";
  if (r < 2.1) return "waking";
  if (r < 5.4) return "working";
  if (r < 6.2) return "rising";
  return "done";
}

/** A summons sent by hand: from burrow `index`, at `at` seconds into night `loop`. */
export interface Sent {
  index: number;
  loop: number;
  at: number;
}

const clamp = (v: number): number => Math.max(0, Math.min(1, v));
const ease = (p: number): number => p * p * (3 - 2 * p);

/** The night at t, for the first `count` burrows, with any summons sent by hand. */
export function nightAt(t: number, count: number, sent: Sent[] = []): Night {
  const loop = Math.floor(t / NIGHT);
  const u = t - loop * NIGHT;
  const runs = BURROWS.slice(0, count).map((burrow, index): Run => {
    const mine = sent.filter((s) => s.index === index && s.loop === loop).at(-1);
    const r = u - (mine ? mine.at : (STARTS[index] ?? 0));
    return { ...burrow, r, phase: phaseOf(r) };
  });
  const planted = runs.filter((run) => run.r >= 6.2).length;
  const reset = clamp((u - 16.6) / 1.2);
  const dawn = ease(clamp(planted / Math.max(1, count))) * (1 - reset);
  return { u, loop, runs, planted, dawn, reset };
}

/**
 * Which burrow a click at x sends a summons to: the nearest one asleep, or
 * none once the night is nearly over or every creature is busy.
 */
export function summonAt(t: number, x: number, xs: number[], sent: Sent[]): Sent | null {
  const night = nightAt(t, xs.length, sent);
  if (night.u > 15.5) return null;
  let best: number | null = null;
  night.runs.forEach((run, index) => {
    const busy = run.r >= 0 && run.r < 6.6;
    const at = xs[index] ?? 0;
    if (!busy && (best === null || Math.abs(at - x) < Math.abs((xs[best] ?? 0) - x))) best = index;
  });
  return best === null ? null : { index: best, loop: night.loop, at: night.u };
}

/** What a run's line under its burrow says. */
export function statusOf(run: Run): string {
  if (run.phase === "waking") return "awake";
  if (run.phase === "rising" || run.phase === "done") return `opened ${run.pr}`;
  if (run.phase !== "working") return "";
  const n = Math.min(2, Math.floor((run.r - 2.1) / 1.1));
  const line = run.steps[n] ?? "";
  const typed = clamp((run.r - 2.1 - n * 1.1) / 0.5);
  return line.slice(0, Math.ceil(line.length * typed));
}

/** How many burrows fit across a hero `width` wide, and where they sit. */
export function burrowsAcross(width: number): number[] {
  const count = Math.max(3, Math.min(BURROWS.length, Math.floor(width / 280)));
  const gap = width / count;
  return Array.from({ length: count }, (_, i) => Math.round(gap * (i + 0.5)));
}
