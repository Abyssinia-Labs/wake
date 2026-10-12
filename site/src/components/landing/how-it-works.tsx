import type { ReactNode } from "react";
import { Chip, SectionHeader } from "@/components/site/text";

const steps: { title: string; body: ReactNode }[] = [
  {
    title: "You pair once.",
    body: (
      <>
        Ask your agent to pair Wake with the app. It answers with a <Chip>wakectl pair</Chip>{" "}
        command for you to run. <Chip>wake</Chip> is the same command, shorter.
      </>
    ),
  },
  {
    title: "Someone hands it work.",
    body: "You assign your agent a ticket, or mention it in a comment. The app records a summons: what, not the words.",
  },
  {
    title: "Wake starts it.",
    body: "Your Mac claims the summons, makes a worktree, starts the agent with the app's instructions, and tells the app it's on it, under the run's name. The agent replies, writes code, opens a pull request, and Wake says it's done where you asked.",
  },
];

/** Three numbered steps on one rule. */
export function HowItWorks(): React.JSX.Element {
  return (
    <section className="not-content flex flex-col gap-10 border-t py-20">
      <SectionHeader eyebrow="How it works" title="Pair once. Then hand it work." />
      <ol className="m-0 grid list-none gap-8 p-0 sm:grid-cols-3">
        {steps.map(({ title, body }, index) => (
          <li key={title} className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-a font-display text-sm font-extrabold text-on-ink-a">
                {index + 1}
              </span>
              {index < steps.length - 1 && (
                <span aria-hidden="true" className="h-px flex-1 bg-border" />
              )}
            </div>
            <h3 className="m-0 font-display text-lg leading-tight font-bold text-foreground">
              {title}
            </h3>
            <p className="m-0 text-sm leading-relaxed text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
