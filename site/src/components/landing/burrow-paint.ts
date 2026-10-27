// What the hero's painters share (burrow-paint-*.ts): where things sit on a
// canvas of any width, the theme's inks read from its own tokens (so the
// night follows the theme and its light or dark, as the page does), and
// the moves every theme makes the same way: a summons falling, a flag
// rising. One painter a theme draws them in that theme's way.
import {
  critter,
  finch,
  heron,
  lark,
  otter,
  owl,
  owlAsleep,
  type Sprite,
} from "@/components/site/sprites";
import type { Creature, Night, Run } from "./burrow-night";

export type RGB = [number, number, number];

export interface Palette {
  dark: boolean;
  paper: RGB;
  ink: RGB;
  ink2: RGB;
  rule: RGB;
  card: RGB;
  wash: RGB;
  accent: RGB;
  /** Burrow's orange case, Signal's run cobalt. */
  case: RGB;
  run: RGB;
}

export interface Geometry {
  w: number;
  h: number;
  /** The horizon, and the middle of the chambers below it. */
  hz: number;
  ch: number;
  xs: number[];
  /** The words' box, which a summons falls short of. */
  copy: { left: number; right: number; bottom: number };
  compact: boolean;
}

export interface Scene {
  c: CanvasRenderingContext2D;
  g: Geometry;
  p: Palette;
  night: Night;
  t: number;
}

export const css = ([r, g, b]: RGB, alpha = 1): string =>
  alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha.toFixed(3)})`;

export const mix = (a: RGB, b: RGB, k: number): RGB => [
  Math.round(a[0] + (b[0] - a[0]) * k),
  Math.round(a[1] + (b[1] - a[1]) * k),
  Math.round(a[2] + (b[2] - a[2]) * k),
];

export const ease = (p: number): number => p * p * (3 - 2 * p);
export const clamp = (v: number): number => Math.max(0, Math.min(1, v));

/** Reads one colour token as RGB, resolving color-mix() through a probe. */
function token(probe: HTMLElement, name: string, fallback: RGB): RGB {
  probe.style.color = `var(${name})`;
  const value = getComputedStyle(probe).color;
  const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
  if (parts.length < 3) return fallback;
  // color(srgb r g b) comes in 0..1; rgb() in 0..255.
  const unit = value.startsWith("color(") ? 255 : 1;
  return [
    Math.round((parts[0] ?? 0) * unit),
    Math.round((parts[1] ?? 0) * unit),
    Math.round((parts[2] ?? 0) * unit),
  ];
}

/** The theme's inks, as the page wears them now. */
export function readPalette(host: HTMLElement): Palette {
  const probe = document.createElement("span");
  probe.style.display = "none";
  host.append(probe);
  const read = (name: string, fallback: RGB): RGB => token(probe, name, fallback);
  const palette: Palette = {
    dark: document.documentElement.dataset.theme !== "light",
    paper: read("--wk-paper", [15, 36, 28]),
    ink: read("--wk-ink", [159, 232, 200]),
    ink2: read("--wk-ink2", [95, 168, 138]),
    rule: read("--wk-rule", [95, 168, 138]),
    card: read("--wk-card", [15, 36, 28]),
    wash: read("--wk-wash", [23, 53, 40]),
    accent: read("--wk-a", [159, 232, 200]),
    case: read("--wk-case", [244, 122, 62]),
    run: read("--wk-run", [31, 59, 255]),
  };
  probe.remove();
  return palette;
}

const SPRITES: Record<Creature, Sprite> = { lark, otter, owl, heron, finch, critter };

/** A creature's pixels, the owl's eyes shut while it sleeps. */
export function creature(run: Run, awake: boolean): Sprite {
  if (run.creature === "owl" && !awake) return owlAsleep;
  return SPRITES[run.creature];
}

/** Draws a sprite's set pixels, s px each, from (x, y). */
export function sprite(
  c: CanvasRenderingContext2D,
  art: Sprite,
  x: number,
  y: number,
  s: number,
  fill: string,
): void {
  c.fillStyle = fill;
  art.rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === "#") c.fillRect(x + i * s, y + j * s, s, s);
  });
}

/** Where a falling summons is: down from the sky to the surface, then down the hole. */
export function fallAt(run: Run, x: number, g: Geometry): [number, number] {
  const under = x > g.copy.left - 40 && x < g.copy.right + 40;
  const from = under ? Math.max(g.copy.bottom + 24, g.hz - 110) : 40;
  if (run.r < 1) return [x, from + (g.hz - 10 - from) * ease(run.r)];
  return [x, g.hz - 10 + (g.ch - 60 - g.hz) * clamp((run.r - 1) / 0.6)];
}

/** The top of a run's flag: rising up its hole, then planted, lowered as night falls. */
export function flagTop(run: Run, g: Geometry, reset: number): number {
  const p = run.phase === "rising" ? ease((run.r - 5.4) / 0.8) : 1;
  return g.ch - 50 + (g.hz - 64 - (g.ch - 50)) * p + reset * 80;
}

/** Whether a run's creature is up: awake, working or carrying its flag up. */
export const isUp = (run: Run): boolean =>
  run.phase === "waking" || run.phase === "working" || run.phase === "rising";

/** What a summons asks, beside it: to its right, or its left near the screen's edge. */
export function askBeside(
  c: CanvasRenderingContext2D,
  text: string,
  fx: number,
  fy: number,
  gap: number,
  w: number,
): void {
  const right = fx + gap + c.measureText(text).width < w - 12;
  c.textAlign = right ? "left" : "right";
  c.fillText(text, right ? fx + gap : fx - gap, fy);
}

/** A small deterministic scatter, for stars and specks. */
export function scatter(n: number, seed: number): RGB[] {
  const out: RGB[] = [];
  let s = seed;
  const next = (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < n; i++) out.push([next(), next(), next()]);
  return out;
}
