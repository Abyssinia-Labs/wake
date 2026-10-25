import type { ReactNode } from "react";
import { CaseMark } from "@/components/site/mark";
import { cn } from "@/lib/utils";

// The pieces GitHub's issue and pull request pages (demo-github.tsx) are
// built from, in GitHub's own palette (demo.css, `.gh`): the page frame,
// the Open pill, labels, avatars, a comment, a sidebar section, the header.

export const border = "border-[var(--gh-border)]";
export const muted = "text-[var(--gh-muted)]";

export function Page({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div
      className={cn(
        "gh min-h-[30rem] overflow-hidden rounded-xl border text-[13px] leading-normal",
        border,
      )}
    >
      {children}
    </div>
  );
}

export function OpenPill({ icon }: { icon: ReactNode }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gh-green-bg)] px-2.5 py-1 text-xs font-medium text-white">
      {icon}
      Open
    </span>
  );
}

export function Label({ name }: { name: "wake" | "enhancement" }): React.JSX.Element {
  const wake = name === "wake";
  return (
    <span
      className="inline-flex rounded-full px-2 py-px text-xs font-medium"
      style={{
        background: `var(--gh-label-${wake ? "wake" : "enh"}-bg)`,
        color: `var(--gh-label-${wake ? "wake" : "enh"}-fg)`,
      }}
    >
      {name}
    </span>
  );
}

export function Avatar({ who }: { who: "michael" | "bot" }): React.JSX.Element {
  return who === "bot" ? (
    <span className="inline-flex size-6 shrink-0 overflow-hidden rounded-full">
      <CaseMark className="size-6" />
    </span>
  ) : (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--gh-bg-3)] text-[11px] font-semibold">
      M
    </span>
  );
}

export function Comment({
  who,
  name,
  when,
  bot,
  children,
  reactions,
}: {
  who: "michael" | "bot";
  name: string;
  when: string;
  bot?: boolean;
  children: ReactNode;
  reactions?: ReactNode;
}): React.JSX.Element {
  return (
    <div className="flex gap-2.5">
      <Avatar who={who} />
      <div className={cn("min-w-0 flex-1 rounded-md border", border)}>
        <div
          className={cn(
            "flex flex-wrap items-center gap-1.5 border-b bg-[var(--gh-bg-2)] px-3 py-1.5 text-xs",
            border,
            muted,
          )}
        >
          <span className="font-semibold text-[var(--gh-fg)]">{name}</span>
          {bot && (
            <span className={cn("rounded-full border px-1.5 text-[10px] leading-4", border)}>
              bot
            </span>
          )}
          commented {when}
        </div>
        <div className="flex flex-col gap-2 px-3 py-2.5">{children}</div>
        {reactions && <div className="px-3 pb-2.5">{reactions}</div>}
      </div>
    </div>
  );
}

export function Side({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={cn("flex flex-col gap-1.5 border-b pb-3 text-xs", border)}>
      <span className={cn("font-semibold", muted)}>{title}</span>
      {children}
    </div>
  );
}

export function Header({
  title,
  number,
  icon,
  children,
}: {
  title: string;
  number: number;
  icon: ReactNode;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <div className={cn("border-b px-5 pt-4 pb-3", border)}>
      <div className={cn("text-xs", muted)}>acme / cli</div>
      <p className="m-0 mt-1 text-xl leading-tight font-semibold">
        {title} <span className={cn("font-light", muted)}>#{number}</span>
      </p>
      <div className={cn("mt-2 flex flex-wrap items-center gap-2 text-xs", muted)}>
        <OpenPill icon={icon} />
        <span>{children}</span>
      </div>
    </div>
  );
}
