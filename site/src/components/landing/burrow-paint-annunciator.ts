// The night in Annunciator: the ground is a bus bar and each burrow a legend
// wired to it, engraved grey until it means something. A summons is a lit
// pulse down the wire; a creature at work lights green; a pull request is a
// white information lamp, raised over its legend. The horizon strip warms
// with each one. By day (light) the same lamps on the day panel.
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
} from "./burrow-paint";

const LIT_NIGHT: RGB = [116, 255, 185];
const GLOW: RGB = [57, 217, 138];

export function paintAnnunciator({ c, g, p, night }: Scene): void {
  const lit = p.dark ? LIT_NIGHT : p.accent;
  const info = p.ink;
  const unlit = mix(p.card, p.ink2, 0.45);
  const mono = (size: number, weight = 400): string =>
    `${weight} ${size}px "B612 Mono", ui-monospace, monospace`;

  // The panel, and its horizon strip warming with each flag.
  const panel = c.createLinearGradient(0, 0, 0, g.hz);
  panel.addColorStop(0, css(mix(p.paper, [255, 255, 255], p.dark ? 0.04 : 0.12)));
  panel.addColorStop(1, css(p.paper));
  c.fillStyle = panel;
  c.fillRect(0, 0, g.w, g.hz);
  const warm = c.createLinearGradient(0, g.hz - 70, 0, g.hz);
  warm.addColorStop(0, css(GLOW, 0));
  warm.addColorStop(1, css(GLOW, (p.dark ? 0.05 : 0.04) + night.dawn * (p.dark ? 0.22 : 0.16)));
  c.fillStyle = warm;
  c.fillRect(0, g.hz - 70, g.w, 70);

  // Below the bar: a darker bay.
  c.fillStyle = css(mix(p.paper, [0, 0, 0], p.dark ? 0.18 : 0.04));
  c.fillRect(0, g.hz, g.w, g.h - g.hz);
  c.fillStyle = css(p.rule);
  c.fillRect(0, g.hz, g.w, 3);
  c.fillStyle = css([255, 255, 255], p.dark ? 0.06 : 0.5);
  c.fillRect(0, g.hz + 3, g.w, 1);

  const cw = g.compact ? 112 : 170;
  const chh = g.compact ? 70 : 90;
  night.runs.forEach((run, i) => {
    const x = g.xs[i] ?? 0;
    const up = isUp(run);
    const done = run.phase === "rising" || run.phase === "done";
    const live = up || (run.phase === "falling" && run.r > 1);

    // The wire from the bar to the legend.
    c.strokeStyle = css(live ? GLOW : p.rule);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, g.hz + 3);
    c.lineTo(x, g.ch - chh / 2);
    c.stroke();

    // The legend, behind its glass.
    c.fillStyle = css(p.card);
    c.strokeStyle = css(up ? GLOW : done ? p.ink2 : p.rule);
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect(x - cw / 2, g.ch - chh / 2, cw, chh, 6);
    c.fill();
    c.stroke();
    if (up) {
      const glow = c.createRadialGradient(x, g.ch, 4, x, g.ch, cw / 2);
      glow.addColorStop(0, css(GLOW, 0.22));
      glow.addColorStop(1, css(GLOW, 0));
      c.fillStyle = glow;
      c.fillRect(x - cw / 2 + 1, g.ch - chh / 2 + 1, cw - 2, chh - 2);
    }
    const s = g.compact ? 2 : 3;
    c.save();
    if (up) {
      c.shadowColor = css(GLOW, 0.8);
      c.shadowBlur = 10;
    }
    const art = creature(run, up);
    c.fillStyle = css(up ? lit : done ? p.ink2 : unlit);
    art.rows.forEach((row, j) => {
      for (let k = 0; k < row.length; k++)
        if (row[k] === "#") c.fillRect(x - 8 * s + k * s, g.ch - 8 * s + j * s, s, s);
    });
    c.restore();
    c.fillStyle = css(up ? lit : done ? info : unlit);
    c.beginPath();
    c.arc(x + cw / 2 - 12, g.ch - chh / 2 + 12, 4, 0, Math.PI * 2);
    c.fill();

    // Engraved under the legend: whose machine; lit: what it's doing.
    c.textAlign = "center";
    c.font = mono(g.compact ? 9 : 10, 700);
    c.fillStyle = css(up ? p.ink2 : mix(p.ink2, p.paper, 0.25));
    const label =
      run.phase === "asleep" || run.phase === "falling" ? (g.compact ? "" : run.who) : run.run;
    c.fillText(label.toUpperCase(), x, g.ch + chh / 2 + 20);
    const status = run.phase === "waking" ? "CLAIMED" : statusOf(run);
    if (status) {
      c.font = mono(g.compact ? 11 : 12);
      c.fillStyle = css(done ? info : lit);
      c.fillText(status, x, g.ch + chh / 2 + 40);
    }

    // The summons: a lit pulse, what was asked beside it.
    if (run.phase === "falling") {
      const [fx, fy] = fallAt(run, x, g);
      c.save();
      c.shadowColor = css(GLOW, 0.9);
      c.shadowBlur = 14;
      c.fillStyle = css(lit);
      c.beginPath();
      c.arc(fx, fy, 6, 0, Math.PI * 2);
      c.fill();
      c.restore();
      if (run.r < 1 && !g.compact) {
        c.font = mono(10, 700);
        c.fillStyle = css(lit);
        askBeside(c, run.ask.toUpperCase(), fx, fy + 4, 14, g.w);
      }
    }

    // The pull request: a white information lamp on a stem.
    if (done && night.reset < 1) {
      const y = flagTop(run, g, night.reset);
      c.fillStyle = css(p.ink2);
      c.fillRect(x - 1, y, 2, 60);
      c.save();
      c.shadowColor = css(info, 0.5);
      c.shadowBlur = p.dark ? 8 : 0;
      c.fillStyle = css(info);
      c.beginPath();
      c.roundRect(x + 2, y, 62, 20, 3);
      c.fill();
      c.restore();
      c.font = mono(10, 700);
      c.textAlign = "left";
      c.fillStyle = css(p.card);
      c.fillText(`PR ${run.pr}`, x + 8, y + 14);
    }
  });
}
