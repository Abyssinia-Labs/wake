import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { logLines, prompt, run, session } from "./wake-demo-data";

// The machine's side of the run: the Claude Code session Wake starts (in
// herdr, a tab named after the summons and the run), and `wake logs -f`
// beside it, painted as the command paints it (src/log-colors.ts). Both
// keep their newest lines in view, as a terminal does.

function Window({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "term flex flex-col overflow-hidden rounded-xl border border-black/40",
        className,
      )}
    >
      <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center bg-[var(--t-bar)] px-3 py-2 text-xs text-[var(--t-dim)]">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="truncate text-center">{title}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden p-4 text-xs leading-relaxed [mask-image:linear-gradient(to_bottom,transparent,black_2.5rem)]">
        {children}
      </div>
    </div>
  );
}

const box = "border-[var(--t-clay)]";

/** Claude Code, as it shows in the tab: the banner, the prompt, each tool call and its result. */
export function ClaudeSession({ phase }: { phase: number }): React.JSX.Element {
  const shown = session.filter((line) => line.at <= phase);
  const working = phase < 7;
  return (
    <Window title={`acme/cli#42 · ${run.name} — claude`} className="h-[30rem]">
      <div className={cn("mb-3 rounded border px-3 py-2", box)}>
        <p className="m-0">
          <span className="text-[var(--t-clay)]">✻</span> Welcome to Claude Code!
        </p>
        <p className="m-0 mt-2 text-[var(--t-dim)]">
          /help for help, /status for your current setup
        </p>
        <p className="m-0 mt-2 text-[var(--t-dim)] [overflow-wrap:anywhere]">cwd: {run.worktree}</p>
      </div>
      <p className="m-0 mb-3 line-clamp-3 text-[var(--t-dim)]">&gt; {prompt}</p>
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {shown.map((line) =>
          line.kind === "say" ? (
            <li key={line.text} className="[overflow-wrap:anywhere]">
              <span className="text-[var(--t-fg)]">⏺</span> {line.text}
            </li>
          ) : (
            <li key={line.text} className="[overflow-wrap:anywhere]">
              <span className="text-[var(--t-green)]">⏺</span>{" "}
              <span className="font-bold">{line.text}</span>
              <br />
              <span className="text-[var(--t-dim)]">&nbsp;&nbsp;⎿&nbsp; {line.result}</span>
            </li>
          ),
        )}
      </ol>
      {working && (
        <p className="m-0 mt-3 text-[var(--t-clay)]">
          ✻ Cogitating… <span className="text-[var(--t-dim)]">(esc to interrupt)</span>
        </p>
      )}
      <div className="mt-3 rounded border border-[var(--t-dim)]/60 px-3 py-1.5 text-[var(--t-dim)]">
        &gt;
      </div>
      <p className="m-0 mt-1 text-[var(--t-dim)]">
        &nbsp;&nbsp;⏵⏵ accept edits on (shift+tab to cycle)
      </p>
    </Window>
  );
}

const tones = {
  plain: "text-[var(--t-fg)]",
  cyan: "text-[var(--t-cyan)]",
  bold: "font-bold text-[var(--t-fg)]",
  green: "text-[var(--t-green)]",
};

/** `wake logs -f`: every line the listener writes, in the colours the command gives them. */
export function WakeLogs({ phase }: { phase: number }): React.JSX.Element {
  const shown = logLines.filter((line) => line.at <= phase);
  return (
    <Window title="wake logs -f — ~" className="h-[30rem]">
      <p className="m-0 mb-2">
        <span className="text-[var(--t-dim)]">$</span> wake logs -f
      </p>
      <ol className="m-0 flex list-none flex-col gap-1 p-0">
        {shown.map((line) => (
          <li key={`${line.stamp}${line.text}`} className="flex gap-2 [overflow-wrap:anywhere]">
            <span className="shrink-0 text-[var(--t-dim)]">{line.stamp}</span>
            <span className={cn("min-w-0", tones[line.tone])}>{line.text}</span>
          </li>
        ))}
      </ol>
    </Window>
  );
}
