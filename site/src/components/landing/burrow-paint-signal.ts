// The night in Signal: no sky and no soil, only the shape alphabet. The
// ground is a heavy rule; each burrow a circle (hollow asleep, cobalt at
// work, ink once done); a summons is the vermilion square, which nothing
// else may wear; flags are ink. In place of a sunrise it keeps score.
import { statusOf } from "./burrow-night";
import { askBeside, css, fallAt, flagTop, isUp, type RGB, type Scene } from "./burrow-paint";

const ASK: RGB = [255, 59, 31];
const FACE = '"Archivo Variable", "Helvetica Neue", Arial, sans-serif';

export function paintSignal({ c, g, p, night }: Scene): void {
  c.fillStyle = css(p.paper);
  c.fillRect(0, 0, g.w, g.h);
  c.fillStyle = css(p.ink);
  c.fillRect(0, g.hz - 3, g.w, 6);

  const r = g.compact ? 34 : 48;
  night.runs.forEach((run, i) => {
    const x = g.xs[i] ?? 0;
    const up = isUp(run);
    const done = run.phase === "rising" || run.phase === "done";
    const live = up || (run.phase === "falling" && run.r > 1);

    c.strokeStyle = css(live ? p.run : p.ink);
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(x, g.hz + 3);
    c.lineTo(x, g.ch - r - 2);
    c.stroke();

    const pulse = run.phase === "working" && Math.floor(run.r / 0.5) % 2 ? 4 : 0;
    c.beginPath();
    c.arc(x, g.ch, r + pulse, 0, Math.PI * 2);
    if (up) {
      c.fillStyle = css(p.run);
      c.fill();
    } else if (done) {
      c.fillStyle = css(p.ink);
      c.fill();
    } else {
      c.lineWidth = 4;
      c.strokeStyle = css(p.ink);
      c.stroke();
    }

    c.textAlign = "center";
    c.font = `expanded 700 ${g.compact ? 9 : 10}px ${FACE}`;
    c.fillStyle = css(p.ink2);
    const label =
      run.phase === "asleep" || run.phase === "falling" ? (g.compact ? "" : run.who) : run.run;
    c.fillText(label.toUpperCase(), x, g.ch + r + 26);
    const status = run.phase === "waking" ? "claimed" : statusOf(run);
    if (status) {
      c.font = `600 ${g.compact ? 12 : 14}px ${FACE}`;
      c.fillStyle = css(up ? p.run : p.ink);
      c.fillText(status, x, g.ch + r + 46);
    }

    if (run.phase === "falling") {
      const [fx, fy] = fallAt(run, x, g);
      c.fillStyle = css(ASK);
      c.fillRect(fx - 11, fy - 11, 22, 22);
      if (run.r < 1 && !g.compact) {
        c.font = `expanded 700 10px ${FACE}`;
        c.fillStyle = css(p.ink);
        askBeside(c, run.ask.toUpperCase(), fx, fy + 4, 20, g.w);
      }
    }

    if (done && night.reset < 1) {
      const y = flagTop(run, g, night.reset);
      c.fillStyle = css(p.ink);
      c.fillRect(x - 2, y, 4, 60);
      c.fillRect(x + 2, y, 52, 24);
      c.font = `extra-condensed 800 18px ${FACE}`;
      c.textAlign = "left";
      c.fillStyle = css(p.paper);
      c.fillText(run.pr, x + 8, y + 18);
    }
  });

  // The score: flags standing, read as pull requests by morning.
  const score = String(Math.round(night.planted * (1 - night.reset)));
  c.textAlign = "right";
  c.fillStyle = css(p.ink);
  const right = g.w - (g.compact ? 16 : Math.max(48, (g.w - 1120) / 2));
  if (g.compact) {
    c.font = `extra-condensed 900 44px ${FACE}`;
    c.fillText(score, right, g.hz - 40);
    c.font = `expanded 700 9px ${FACE}`;
    c.fillText("PULL REQUESTS BY MORNING", right, g.hz - 22);
  } else {
    c.font = `extra-condensed 900 120px ${FACE}`;
    c.fillText(score, right, g.hz * 0.5);
    c.font = `expanded 700 12px ${FACE}`;
    c.fillText("PULL REQUESTS BY MORNING", right, g.hz * 0.5 + 30);
  }
}
