// The hero's night (burrow-night.ts), drawn on a canvas the full width of
// the page behind the words, in whichever theme is on (a painter each).
// It plays while on screen; a reader who asks for less motion gets the
// still mid-night until they press Play. A click in the sky sends a summons
// to the nearest burrow asleep.
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { burrowsAcross, nightAt, type Sent, STILL, summonAt } from "./burrow-night";
import { type Geometry, type Palette, readPalette, type Scene } from "./burrow-paint";
import { paintAnnunciator } from "./burrow-paint-annunciator";
import { paintBurrow } from "./burrow-paint-burrow";
import { paintSignal } from "./burrow-paint-signal";

const PAINTERS: Record<string, (scene: Scene) => void> = {
  burrow: paintBurrow,
  annunciator: paintAnnunciator,
  signal: paintSignal,
};
const SAID =
  "A cross-section of ground at night, a burrow for each person's machine. Summons fall from the sky; each creature wakes, works, and sends a pull request up as a flag, until morning.";

/** Where everything sits, from the hero's own boxes: the words, and the ground under them. */
function measure(canvas: HTMLCanvasElement): Geometry | null {
  const hero = canvas.closest<HTMLElement>(".burrow-hero");
  const ground = hero?.querySelector<HTMLElement>("[data-ground]");
  const copy = hero?.querySelector<HTMLElement>("[data-copy]");
  if (!hero || !ground || !copy) return null;
  const box = hero.getBoundingClientRect();
  const words = copy.getBoundingClientRect();
  const w = box.width;
  const hz = ground.offsetTop;
  return {
    w,
    h: box.height,
    hz,
    ch: hz + (box.height - hz) * 0.42,
    xs: burrowsAcross(w),
    copy: {
      left: words.left - box.left,
      right: words.right - box.left,
      bottom: words.bottom - box.top,
    },
    compact: w < 640,
  };
}

export function BurrowHero(): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const clock = useRef({ t: STILL, sent: [] as Sent[] });
  const view = useRef<{ g: Geometry | null; p: Palette | null; theme: string }>({
    g: null,
    p: null,
    theme: "burrow",
  });

  const paint = (): void => {
    const el = canvas.current;
    const { g, p, theme } = view.current;
    const c = el?.getContext("2d");
    if (!el || !c || !g || !p) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (el.width !== Math.round(g.w * dpr) || el.height !== Math.round(g.h * dpr)) {
      el.width = Math.round(g.w * dpr);
      el.height = Math.round(g.h * dpr);
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, g.w, g.h);
    const night = nightAt(clock.current.t, g.xs.length, clock.current.sent);
    (PAINTERS[theme] ?? paintBurrow)({ c, g, p, night, t: clock.current.t });
  };

  // The page's boxes and inks: measured now, again on a resize or a theme change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: paint reads refs only
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const read = (): void => {
      view.current = {
        g: measure(el),
        p: readPalette(el.parentElement ?? document.body),
        theme: document.documentElement.dataset.wakeTheme ?? "burrow",
      };
      paint();
    };
    read();
    const hero = el.closest(".burrow-hero");
    const resized = new ResizeObserver(read);
    if (hero) resized.observe(hero);
    const themed = new MutationObserver(read);
    themed.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-wake-theme"],
    });
    document.fonts?.ready.then(read);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clock.current.t = 0;
      setPlaying(true);
    }
    return () => {
      resized.disconnect();
      themed.disconnect();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: paint reads refs only
  useEffect(() => {
    if (!playing) return;
    let visible = true;
    const watch = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    if (canvas.current) watch.observe(canvas.current);
    let last = performance.now();
    let id = 0;
    const tick = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (visible && !document.hidden) {
        clock.current.t += dt;
        paint();
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      watch.disconnect();
    };
  }, [playing]);

  const summon = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const g = view.current.g;
    if (!g || event.clientY - event.currentTarget.getBoundingClientRect().top > g.hz) return;
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    const sent = summonAt(clock.current.t, x, g.xs, clock.current.sent);
    if (sent) clock.current.sent = [...clock.current.sent.slice(-12), sent];
    paint();
  };

  return (
    <>
      <canvas ref={canvas} role="img" aria-label={SAID} className="bh-canvas" onClick={summon} />
      <Button
        variant="ghost"
        size="sm"
        className="bh-play text-foreground"
        onClick={() => setPlaying((on) => !on)}
      >
        {playing ? <Pause /> : <Play />}
        {playing ? "Pause" : "Play the night"}
      </Button>
    </>
  );
}
