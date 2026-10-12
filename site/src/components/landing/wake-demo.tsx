import { Pause, Play } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Chip } from "@/components/site/text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { IssuePage, PullRequestPage } from "./demo-github";
import { ClaudeSession, WakeLogs } from "./demo-terminal";
import { LAST_PHASE_OF_STEP, PHASES, STEP_OF_PHASE } from "./wake-demo-data";

/** How long each phase holds before the next. */
const PHASE_MS = 1500;

const steps: { title: string; text: ReactNode }[] = [
  {
    title: "Someone hands it work.",
    text: (
      <>
        You label an issue <Chip>wake</Chip>, or write <Chip>/wake</Chip> in a comment. The app
        records a summons: what, not the words.
      </>
    ),
  },
  {
    title: "Wake starts it.",
    text: "Your Mac claims it within seconds, makes a worktree on the issue's branch, and starts Claude Code there, in a sandbox, with the app's instructions. The issue says who's on it, by name.",
  },
  {
    title: "It ships.",
    text: "Claude Code reads the issue, writes the code, runs the tests and opens a pull request that closes it. Wake says it's done. Merging is yours.",
  },
];

const phasesIn = (step: number): number =>
  LAST_PHASE_OF_STEP[step] - (step === 0 ? -1 : LAST_PHASE_OF_STEP[step - 1]);

/**
 * The demo plays its phases on a loop once it scrolls into view, and stops
 * when a step is picked (which shows that step complete) or paused. With
 * reduced motion it opens on the last phase and waits to be stepped by hand.
 */
export function WakeDemo(): React.JSX.Element {
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const step = STEP_OF_PHASE[phase] ?? 0;

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) setPhase(PHASES - 1);
    else setPlaying(true);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setPhase((current) => (current + 1) % PHASES), PHASE_MS);
    return () => clearInterval(timer);
  }, [playing]);

  const pick = (index: number): void => {
    setPhase(LAST_PHASE_OF_STEP[index] ?? 0);
    setPlaying(false);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <ol className="m-0 grid flex-1 list-none gap-3 p-0 sm:grid-cols-3">
          {steps.map(({ title, text }, index) => {
            const current = index === step;
            return (
              <li key={title}>
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  onClick={() => pick(index)}
                  className={cn(
                    "flex h-full w-full flex-col items-start gap-2.5 rounded-lg border bg-card p-4 text-left transition-colors",
                    current ? "border-ink-a" : "hover:bg-accent",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex size-7 shrink-0 items-center justify-center rounded-full font-display text-xs font-extrabold",
                        index <= step ? "bg-ink-a text-on-ink-a" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="font-display text-base leading-tight font-bold text-foreground">
                      {title}
                    </span>
                  </span>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">{text}</span>
                  <span
                    aria-hidden="true"
                    className="mt-auto h-0.5 w-full overflow-hidden rounded bg-border"
                  >
                    <span
                      className={cn(
                        "block h-full bg-ink-a",
                        index < step && "w-full",
                        index > step && "w-0",
                        current && (playing ? "wake-progress" : "w-full"),
                      )}
                      style={{ animationDuration: `${phasesIn(index) * PHASE_MS}ms` }}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={playing ? "Pause the demo" : "Play the demo"}
          onClick={() => setPlaying(!playing)}
          className="shrink-0 self-start"
        >
          {playing ? <Pause /> : <Play />}
        </Button>
      </div>
      <div aria-live="polite" className="min-h-[30rem]">
        {step === 0 && <IssuePage phase={phase} />}
        {step === 1 && (
          <div className="grid gap-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <ClaudeSession phase={phase} />
            <WakeLogs phase={phase} />
          </div>
        )}
        {step === 2 && <PullRequestPage phase={phase} />}
      </div>
    </div>
  );
}
