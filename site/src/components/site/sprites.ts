// Burrow's creatures, the same pixels as Wake for Mac's `Sprites.swift` and
// Wake on the web's `sprites.ts`: each 16 by 16, one bit, drawn only at
// whole multiples. The site draws the few its hero and mark need.

export type Sprite = { rows: string[]; width: number; height: number };

function sprite(rows: string[]): Sprite {
  return { rows, width: Math.max(...rows.map((r) => r.length)), height: rows.length };
}

export const heron = sprite([
  "................",
  "....###.........",
  "...#####........",
  "...##.#######...",
  "....###.........",
  ".....##.........",
  "......##........",
  "......##........",
  ".....###........",
  "...#######......",
  ".##########.....",
  "##########......",
  "...######.......",
  ".....#..#.......",
  ".....#..#.......",
  "....##.##.......",
]);
export const otter = sprite([
  "................",
  "...##......##...",
  "..############..",
  "..############..",
  "..##.######.##..",
  "..############..",
  "..####....####..",
  "..###..##..###..",
  "...###....###...",
  "....########....",
  "...##########...",
  "..###.####.###..",
  "..############..",
  "..############..",
  "...##########...",
  "....###..###....",
]);
export const owl = sprite([
  "................",
  ".#............#.",
  ".##..........##.",
  ".##############.",
  ".#............#.",
  ".#.##......##.#.",
  ".#.##..##..##.#.",
  ".#.....##.....#.",
  ".###........###.",
  ".##############.",
  ".##.########.##.",
  ".##.########.##.",
  ".##############.",
  "..############..",
  "....##....##....",
  "................",
]);
export const owlAsleep = sprite([
  "................",
  ".#............#.",
  ".##..........##.",
  ".##############.",
  ".#............#.",
  ".#............#.",
  ".#..##.##.##..#.",
  ".#.....##.....#.",
  ".###........###.",
  ".##############.",
  ".##.########.##.",
  ".##.########.##.",
  ".##############.",
  "..############..",
  "....##....##....",
  "................",
]);
/** An ask: no run, so no name and no animal yet. */
export const egg = sprite([
  "................",
  "......####......",
  ".....######.....",
  "....###.####....",
  "....####.###....",
  "...####.#####...",
  "...#####.####...",
  "...##########...",
  "..############..",
  "..############..",
  "..############..",
  "..############..",
  "...##########...",
  "....########....",
  ".....######.....",
  "................",
]);
/** The "!" bubble: something waits on its owner. */
export const bubble = sprite([
  ".#####.",
  "#..#..#",
  "#..#..#",
  "#..#..#",
  "#.....#",
  "#..#..#",
  ".#####.",
  "..#....",
]);

/** The otter asleep: each one-pixel eye filled. */
export const otterAsleep = sprite(
  otter.rows.map((row, y) =>
    y === 4 ? `${row.slice(0, 4)}#${row.slice(5, 11)}#${row.slice(12)}` : row,
  ),
);

/** One SVG path for a sprite at `x`, `y`, `scale` units a pixel: a rectangle per run of ink pixels on each row. */
export function spritePath(s: Sprite, x = 0, y = 0, scale = 1): string {
  const parts: string[] = [];
  s.rows.forEach((row, dy) => {
    for (const match of row.matchAll(/#+/g)) {
      const n = match[0].length * scale;
      parts.push(`M${x + (match.index ?? 0) * scale} ${y + dy * scale}h${n}v${scale}h-${n}z`);
    }
  });
  return parts.join("");
}
