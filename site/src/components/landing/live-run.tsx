// The landing hero in Burrow: Wake for Mac's window with one run printing
// its steps as it fixes an issue and opens a pull request, as the app
// prints them (the screens page's "How a step arrives"). Built to HTML as
// a still mid-run, which is all a reader who asks for less motion sees
// until they press Play; otherwise it plays on a loop while on screen.
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LIVE, STEPS } from "./live-run-data";
import { Band, Creature, Facts, Keys, RunList } from "./live-run-parts";
import { fresh, schedule, typed } from "./live-run-print";

const PRINTED = schedule(STEPS);
const DONE_AT = (PRINTED.at(-1)?.end ?? 0) + 1.6;
const LOOP = DONE_AT + 5;
/** The still the page is built with: mid-run, a few words said. */
const STILL = 9.3;
const FRAME = 1 / 30;
/** A step's row and the gap under it, in the window's pixels. */
const ROW = 23;
const SAID = `Wake for Mac at work: ${LIVE.name} prints each step as it fixes ${LIVE.ref} and opens a pull request.`;

function useClock(): {
  t: number;
  playing: boolean;
  toggle: () => void;
  frame: React.RefObject<HTMLDivElement | null>;
} {
  const [t, setT] = useState(STILL);
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setT(0);
    setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    let visible = true;
    const watch = new IntersectionObserver(([entry]) => {
      visible = entry?.isIntersecting ?? true;
    });
    if (frame.current) watch.observe(frame.current);
    let last = performance.now();
    let gathered = 0;
    let id = 0;
    const tick = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (visible && !document.hidden) {
        gathered += dt;
        if (gathered >= FRAME) {
          const step = gathered;
          gathered = 0;
          setT((current) => (current + step) % LOOP);
        }
      }
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      watch.disconnect();
    };
  }, [playing]);

  return { t, playing, toggle: () => setPlaying((on) => !on), frame };
}

export function LiveRun(): React.JSX.Element {
  const { t, playing, toggle, frame } = useClock();
  const steps = useRef<HTMLDivElement>(null);
  const done = t >= DONE_AT;
  const landed = PRINTED.filter((step) => step.at <= t);
  const last = landed.at(-1);
  const quiet = last ? t - last.end : 0;
  const working = !done && last !== undefined && quiet >= 1.2 && landed.length < PRINTED.length;
  const minutes = done ? LIVE.minutes : Math.max(1, Math.round((t / DONE_AT) * LIVE.minutes));
  // The creature hops two pixels as each step lands, on top of its two-frame bob.
  const hop = !done && landed.some((step) => t - step.at < 0.14);
  const lift = done ? 0 : hop ? 2 : Math.floor(t / 0.45) % 2 === 0 ? 1 : 0;

  // The list moves by whole rows: as many as fit, the newest at the bottom,
  // the oldest leaving at the top.
  const [rows, setRows] = useState(15);
  useEffect(() => {
    const box = steps.current;
    if (box) setRows(Math.max(1, Math.floor((box.clientHeight + 2) / ROW)));
  }, []);
  const shown = landed.slice(-(working ? rows - 1 : rows));

  return (
    <div className="lr-frame" ref={frame}>
      <div className="lr-stage" role="img" aria-label={SAID}>
        <div className="lr-win">
          <Band />
          <div className="lr-body">
            <div className="lr-screen">
              <RunList done={done} minutes={minutes} lift={lift} />
            </div>
            <div className="lr-detail">
              <div className="lr-screen">
                <div className="lr-run">
                  <div className="lr-head">
                    <Creature
                      name={LIVE.name}
                      status={done ? "done" : "running"}
                      px={4}
                      lift={lift}
                    />
                    <div>
                      <div className="lr-nm">{LIVE.name}</div>
                      <div className="lr-hl">
                        {done
                          ? `Done at ${LIVE.ended}, after ${LIVE.minutes} min`
                          : `On it for ${minutes} min`}
                      </div>
                    </div>
                  </div>
                  <Facts />
                  <div className="lr-sh">What it's done</div>
                  <div className="lr-steps" ref={steps}>
                    {shown.map((step, index) => {
                      const text = typed(step, t);
                      const printing = t < step.end;
                      const isLast = index === shown.length - 1;
                      // Solid while printing, two blinks once quiet, then gone.
                      const cursor =
                        isLast &&
                        !done &&
                        (printing || (quiet < 1.2 && Math.floor(quiet / 0.3) % 2 === 1));
                      const ghost = fresh(step, t);
                      return (
                        <div className="lr-step" key={step.line}>
                          <span className="lr-at">
                            {step.clock !== shown[index - 1]?.clock ? step.clock : ""}
                          </span>
                          <span
                            className="lr-ln"
                            style={
                              ghost > 0
                                ? ({ "--lr-ghost": ghost } as React.CSSProperties)
                                : undefined
                            }
                          >
                            {text}
                            {cursor && <span className="lr-cur" />}
                          </span>
                        </div>
                      );
                    })}
                    {working && (
                      <div className="lr-step">
                        <span className="lr-at" />
                        <span className="lr-working">
                          {[0, 1, 2].map((i) => (
                            <i
                              key={i}
                              className={i < Math.floor((quiet - 1.2) / 0.25) % 4 ? "lr-lit" : ""}
                            />
                          ))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <Keys done={done} />
            </div>
          </div>
        </div>
      </div>
      <Button variant="ghost" size="sm" className="lr-play text-foreground" onClick={toggle}>
        {playing ? <Pause /> : <Play />}
        {playing ? "Pause" : "Play the run"}
      </Button>
    </div>
  );
}
