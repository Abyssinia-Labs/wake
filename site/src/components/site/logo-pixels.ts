// The logo's pixels (canvas page "Logo", locked in on 2026-10-24): what the
// owl's open and shut eyes change, a smaller owl for the case tile, and
// the wordmark drawn on the owl's own grid, so the name needs no font.
import { owl, owlAsleep, type Sprite } from "./sprites";

function rows(lines: string[]): Sprite {
  return { rows: lines, width: Math.max(...lines.map((l) => l.length)), height: lines.length };
}

function mask(a: Sprite, b: Sprite, keep: (inA: boolean, inB: boolean) => boolean): Sprite {
  return rows(
    a.rows.map((row, y) =>
      [...row].map((c, x) => (keep(c === "#", b.rows[y]?.[x] === "#") ? "#" : ".")).join(""),
    ),
  );
}

/** The owl split for its blink: what it always has, its open eyes, its shut eyes. */
export const owlBody = mask(owl, owlAsleep, (a, b) => a && b);
export const owlOpen = mask(owl, owlAsleep, (a, b) => a && !b);
export const owlShut = mask(owl, owlAsleep, (a, b) => b && !a);

/** The owl at 12 pixels, drawn at twice its size on Wake for GitHub's orange case. */
export const owl12 = rows([
  "#..........#",
  "##........##",
  "############",
  "#..........#",
  "#.##....##.#",
  "#.##.##.##.#",
  "#....##....#",
  "###......###",
  "############",
  "#.########.#",
  "############",
  "..##....##..",
]);

const GLYPHS: Record<string, string[]> = {
  w: [".....", ".....", "#...#", "#...#", "#.#.#", "#.#.#", ".#.#."],
  a: ["....", "....", "###.", "...#", ".###", "#..#", ".###"],
  k: ["#...", "#...", "#..#", "#.#.", "##..", "#.#.", "#..#"],
  e: ["....", "....", ".##.", "#..#", "####", "#...", ".###"],
  c: ["...", "...", ".##", "#..", "#..", "#..", ".##"],
  t: ["#..", "#..", "###", "#..", "#..", "#..", ".##"],
  l: ["#.", "#.", "#.", "#.", "#.", "#.", ".#"],
};

/** A name in the wordmark's letters, one pixel apart, seven pixels tall. */
export function wordmark(name: string): Sprite {
  const lines = Array.from({ length: 7 }, (_, r) =>
    [...name].map((ch) => GLYPHS[ch]?.[r] ?? "...").join("."),
  );
  return rows(lines);
}
