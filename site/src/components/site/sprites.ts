// Burrow's creatures, the same pixels as Wake for Mac's `Sprites.swift` and
// Wake on the web's `sprites.ts`: each 16 by 16, one bit, drawn only at
// whole multiples. The site draws the few its hero and mark need.
// Animals not drawn yet show the critter, as in the apps.

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

export const lark = sprite([
  "................",
  "................",
  ".......#........",
  "......##........",
  "......###.......",
  ".....#####......",
  ".....##.####....",
  "....######......",
  "..#########.....",
  ".###########....",
  "..##########....",
  "...#########....",
  "....#######.....",
  "......#..#......",
  ".....##.##......",
  "................",
]);
export const finch = sprite([
  "................",
  "................",
  "................",
  "......####......",
  ".....######.....",
  "...###.#####....",
  "....#########...",
  "....##########..",
  "....###########.",
  "....##########..",
  ".....########...",
  "......######....",
  ".......#..#.....",
  "......##.##.....",
  "................",
  "................",
]);
/** Every animal not drawn yet. */
export const critter = sprite([
  "................",
  "................",
  "....##....##....",
  "...####..####...",
  "...##########...",
  "..############..",
  "..###.####.###..",
  "..############..",
  "..####....####..",
  "..#####..#####..",
  "...##########...",
  "...##########...",
  "....########....",
  "....##....##....",
  "...###....###...",
  "................",
]);
/** Over a run that couldn't finish. */
export const cloud = sprite([
  "...###...",
  ".######..",
  "#########",
  ".#######.",
  "..#.#.#..",
  ".#.#.#...",
]);

const drawn: Record<string, { sprite: Sprite; eyes: [number, number][] }> = {
  heron: { sprite: heron, eyes: [[5, 3]] },
  otter: {
    sprite: otter,
    eyes: [
      [4, 4],
      [11, 4],
    ],
  },
  lark: { sprite: lark, eyes: [[7, 6]] },
  finch: { sprite: finch, eyes: [[6, 5]] },
};

/** A run's creature, by the animal its name ends in, its eyes shut when asleep. */
export function creatureOf(name: string, asleep = false): Sprite {
  const known = drawn[name.split("-").pop() ?? ""] ?? {
    sprite: critter,
    eyes: [
      [5, 6],
      [10, 6],
    ],
  };
  if (!asleep) return known.sprite;
  const rows = known.sprite.rows.map((row) => [...row]);
  for (const [x, y] of known.eyes) {
    const row = rows[y];
    if (row) row[x] = "#";
  }
  return sprite(rows.map((row) => row.join("")));
}

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
