// The night in Burrow: a monochrome LCD that can't fade or glide, so
// everything sits on whole cells, the creatures are Burrow's own sprites,
// and the one colour is the case's orange: the flags, and the sun they
// bring up. Daylight's screen (light) keeps the same night, in its inks.
import { statusOf } from "./burrow-night";
import {
  askBeside,
  creature,
  css,
  fallAt,
  flagTop,
  isUp,
  mix,
  type RGB,
  type Scene,
  scatter,
  sprite,
} from "./burrow-paint";

const BLACK: RGB = [0, 0, 0];
const CASE_TEXT = "rgb(31 42 26)";

export function paintBurrow({ c, g, p, night, t }: Scene): void {
  const s = g.compact ? 3 : 4;
  const snap = (v: number): number => Math.round(v / s) * s;
  const box = (x: number, y: number, w: number, h: number, fill: string): void => {
    c.fillStyle = fill;
    c.fillRect(snap(x), snap(y), w, h);
  };
  const { dawn } = night;

  // The sky: night to morning as the flags go up.
  const top = p.dark
    ? mix(mix(p.paper, BLACK, 0.45), mix(p.paper, p.ink, 0.1), dawn)
    : mix(mix(p.paper, p.ink, 0.2), p.paper, dawn);
  const low = p.dark
    ? mix(p.paper, mix(p.paper, p.ink, 0.3), dawn)
    : mix(mix(p.paper, p.ink, 0.08), mix(p.paper, p.case, 0.22), dawn);
  const sky = c.createLinearGradient(0, 0, 0, g.hz);
  sky.addColorStop(0, css(top));
  sky.addColorStop(1, css(low));
  c.fillStyle = sky;
  c.fillRect(0, 0, g.w, g.hz);
  scatter(Math.round(g.w / 16), 7).forEach(([a, b], i) => {
    const twinkle = Math.sin(t * (1 + (i % 5) * 0.4) + i) > -0.4;
    const alpha = (1 - dawn) * (twinkle ? 0.7 : 0.25) * (p.dark ? 1 : 0.6);
    if (alpha > 0.05) box(a * g.w, b * (g.hz - 80), s, s, css(p.ink, alpha));
  });

  // The sun comes up at the right, the case's orange, clipped by the horizon.
  if (dawn > 0.02) {
    const r = 12 * s;
    const cx = g.w - Math.max(10 * s, (g.w / g.xs.length) * 0.16);
    const cy = g.hz + 10 * s - dawn * (g.compact ? 20 : 28) * s;
    c.save();
    c.beginPath();
    c.rect(0, 0, g.w, g.hz);
    c.clip();
    for (let dy = -r; dy <= r; dy += s) {
      const half = snap(Math.sqrt(Math.max(0, r * r - dy * dy)));
      box(cx - half, cy + dy, half * 2, s, css(p.case));
    }
    c.restore();
    if (dawn > 0.9) {
      c.font = "11px Silkscreen, monospace";
      c.textAlign = "center";
      c.fillStyle = css(p.case);
      c.fillText("RISE AND SHIP", snap(cx), snap(cy - r - 12));
    }
  }

  // The ground, with a speck of soil here and there.
  const ground = p.dark ? p.wash : mix(p.paper, p.ink, 0.12);
  const hole = p.dark ? mix(p.paper, BLACK, 0.3) : mix(p.paper, p.ink, 0.3);
  box(0, g.hz, g.w, g.h - g.hz, css(ground));
  for (const [a, b] of scatter(Math.round(g.w / 6), 3)) {
    box(a * g.w, g.hz + 16 + b * (g.h - g.hz - 16), s, s, css(p.ink, 0.07));
  }
  box(0, g.hz, g.w, s, css(p.rule));

  const chW = (g.compact ? 34 : 42) * s;
  const chH = (g.compact ? 20 : 24) * s;
  night.runs.forEach((run, i) => {
    const x = g.xs[i] ?? 0;
    const up = isUp(run);
    const done = run.phase === "rising" || run.phase === "done";

    // The hole and the chamber, with its corners cut in whole cells.
    box(x - 3 * s, g.hz + s, 6 * s, g.ch - chH / 2 - g.hz, css(hole));
    box(x - chW / 2 + 2 * s, g.ch - chH / 2, chW - 4 * s, s, css(hole));
    box(x - chW / 2 + s, g.ch - chH / 2 + s, chW - 2 * s, s, css(hole));
    box(x - chW / 2, g.ch - chH / 2 + 2 * s, chW, chH - 4 * s, css(hole));
    box(x - chW / 2 + s, g.ch + chH / 2 - 2 * s, chW - 2 * s, s, css(hole));
    box(x - chW / 2 + 2 * s, g.ch + chH / 2 - s, chW - 4 * s, s, css(hole));

    // The creature: dim asleep, lit up; it hops twice as it wakes, bobs as it works.
    const hop =
      run.phase === "waking" && ((run.r > 1.65 && run.r < 1.78) || (run.r > 1.86 && run.r < 1.99))
        ? -2 * s
        : 0;
    const bob = run.phase === "working" && Math.floor(run.r / 0.45) % 2 === 0 ? -s : 0;
    const art = creature(run, up);
    sprite(
      c,
      art,
      snap(x - 8 * s),
      snap(g.ch - 9 * s) + hop + bob,
      s,
      css(up ? p.ink : mix(ground, p.ink, 0.45)),
    );
    if (run.phase === "working" && Math.floor(run.r / 0.3) % 2 === 0) {
      box(x + 10 * s, g.ch + 5 * s - ((run.r * 37) % 3) * s, s, s, css(p.ink2));
      box(x - 12 * s, g.ch + 6 * s - ((run.r * 53) % 3) * s, s, s, css(p.ink2));
    }
    if (run.phase === "asleep" || (run.phase === "done" && run.r > 6.6)) {
      const z = (t * 0.7 + i * 0.37) % 2;
      if (z < 1.4) {
        c.font = "11px Silkscreen, monospace";
        c.textAlign = "left";
        c.fillStyle = css(p.ink2);
        c.fillText("z", snap(x + 7 * s + z * 2 * s), snap(g.ch - 10 * s - z * 3 * s));
      }
    }

    // Whose machine, and what the run is doing.
    c.textAlign = "center";
    c.font = `${g.compact ? 16 : 18}px VT323, monospace`;
    const label =
      run.phase === "asleep" || run.phase === "falling" ? (g.compact ? "" : run.who) : run.run;
    c.fillStyle = css(up ? p.ink : p.ink2);
    c.fillText(label, x, g.ch + chH / 2 + 22);
    const status = statusOf(run);
    if (status) {
      c.fillStyle = css(done ? p.ink2 : p.ink);
      c.fillText(
        status +
          (run.phase === "working" && status.length < (run.steps[2] ?? "").length ? "█" : ""),
        x,
        g.ch + chH / 2 + 42,
      );
    }

    // The summons: an envelope, what was asked trailing beside it in the sky.
    if (run.phase === "falling") {
      const [fx, fy] = fallAt(run, x, g);
      box(fx - 3.5 * s, fy - 2.5 * s, 7 * s, 5 * s, css(p.ink));
      [
        [-2.5, -1.5],
        [-1.5, -0.5],
        [-0.5, 0.5],
        [0.5, -0.5],
        [1.5, -1.5],
      ].forEach(([dx, dy]) => {
        box(fx + (dx ?? 0) * s, fy + (dy ?? 0) * s, s, s, css(hole));
      });
      if (run.r < 1 && !g.compact) {
        c.font = "11px Silkscreen, monospace";
        c.fillStyle = css(p.ink);
        askBeside(c, run.ask.toUpperCase(), snap(fx), snap(fy + s), 6 * s, g.w);
      }
    }

    // The pull request: up the hole, then planted on the surface.
    if (done && night.reset < 1) {
      const y = flagTop(run, g, night.reset);
      box(x - s / 2, y, s, 15 * s, css(p.ink));
      box(x + s / 2, y, 10 * s, 5 * s, css(p.case));
      c.font = "10px Silkscreen, monospace";
      c.textAlign = "left";
      c.fillStyle = CASE_TEXT;
      c.fillText(run.pr, snap(x + 2 * s), snap(y + 4 * s - 1));
    }
  });

  // The screen's lines over everything.
  c.fillStyle = p.dark ? "rgb(0 0 0 / 0.12)" : "rgb(31 42 26 / 0.05)";
  for (let y = 0; y < g.h; y += s) c.fillRect(0, y + s - 1, g.w, 1);
}
