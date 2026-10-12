import { Check, CircleDot, GitPullRequest, Tag } from "lucide-react";
import type { ReactNode } from "react";
import { Mark } from "@/components/site/mark";
import { cn } from "@/lib/utils";
import { issue, pullRequest, run } from "./wake-demo-data";

// GitHub's issue and pull request pages, as the run leaves them, in
// GitHub's own palette (demo.css, `.gh`): a person recognises the page
// before reading a word of it.

const border = "border-[var(--gh-border)]";
const muted = "text-[var(--gh-muted)]";

function Page({ children }: { children: ReactNode }): React.JSX.Element {
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

function OpenPill({ icon }: { icon: ReactNode }): React.JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[var(--gh-green-bg)] px-2.5 py-1 text-xs font-medium text-white">
      {icon}
      Open
    </span>
  );
}

function Label({ name }: { name: "wake" | "enhancement" }): React.JSX.Element {
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

function Avatar({ who }: { who: "michael" | "bot" }): React.JSX.Element {
  return who === "bot" ? (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--gh-bg-3)]">
      <Mark className="size-4" />
    </span>
  ) : (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--gh-bg-3)] text-[11px] font-semibold">
      M
    </span>
  );
}

function Comment({
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

function Side({ title, children }: { title: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className={cn("flex flex-col gap-1.5 border-b pb-3 text-xs", border)}>
      <span className={cn("font-semibold", muted)}>{title}</span>
      {children}
    </div>
  );
}

function Header({
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

/** The issue: labelled, then watched, then the bridge's one comment, edited as the run goes. */
export function IssuePage({ phase }: { phase: number }): React.JSX.Element {
  const labelled = phase >= 1;
  const claimed = phase >= 2;
  const done = phase >= 10;
  return (
    <Page>
      <Header title={issue.title} number={issue.number} icon={<CircleDot className="size-3.5" />}>
        <b className="font-semibold text-[var(--gh-fg)]">{issue.asker}</b> opened this issue 2
        minutes ago · {claimed ? 1 : 0} comment{claimed ? "" : "s"}
      </Header>
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="flex flex-col gap-3">
          <Comment
            who="michael"
            name={issue.asker}
            when="2 minutes ago"
            reactions={
              claimed ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                    border,
                  )}
                >
                  <span aria-hidden="true">👀</span> 1
                </span>
              ) : undefined
            }
          >
            <p className="m-0">{issue.body}</p>
          </Comment>
          {labelled && (
            <div className={cn("ml-8 flex flex-wrap items-center gap-1.5 text-xs", muted)}>
              <Tag className="size-3.5" />
              <b className="font-semibold text-[var(--gh-fg)]">{issue.asker}</b> added the{" "}
              <Label name="wake" /> label just now
            </div>
          )}
          {claimed && (
            <Comment
              who="bot"
              name="wake-for-github"
              when={done ? "just now · edited" : "just now"}
              bot
            >
              {done ? (
                <p className="m-0">
                  ✅ <b>{run.tool}</b> finished <code>{run.name}</code>.
                </p>
              ) : (
                <p className="m-0">
                  ⏰ <b>{run.tool}</b> is on it as <code>{run.name}</code>, on @{issue.asker}'s
                  machine.
                </p>
              )}
              <p className={cn("m-0 text-xs", muted)}>
                @{issue.asker}: <code>wake open {run.name}</code> gets you back into it.
              </p>
            </Comment>
          )}
        </div>
        <aside className="flex flex-col gap-3">
          <Side title="Assignees">
            <span className={muted}>No one assigned</span>
          </Side>
          <Side title="Labels">
            <span className="flex flex-wrap gap-1">
              <Label name="enhancement" />
              {labelled && <Label name="wake" />}
            </span>
          </Side>
          <Side title="Development">
            <span className={muted}>No branches or pull requests</span>
          </Side>
        </aside>
      </div>
    </Page>
  );
}

/** The pull request: open, checks running then passed, merging left to a reviewer. */
export function PullRequestPage({ phase }: { phase: number }): React.JSX.Element {
  const passed = phase >= 9;
  const pr = pullRequest;
  return (
    <Page>
      <Header title={pr.title} number={pr.number} icon={<GitPullRequest className="size-3.5" />}>
        <b className="font-semibold text-[var(--gh-fg)]">{issue.asker}</b> wants to merge{" "}
        {pr.commits.length} commits into{" "}
        <code className="rounded bg-[var(--gh-bg-3)] px-1 text-[var(--gh-link)]">main</code> from{" "}
        <code className="rounded bg-[var(--gh-bg-3)] px-1 text-[var(--gh-link)]">{run.branch}</code>
      </Header>
      <div className={cn("flex flex-wrap gap-5 border-b px-5 text-xs", border, muted)}>
        {[
          ["Conversation", 1],
          ["Commits", pr.commits.length],
          ["Checks", 1],
          ["Files changed", pr.files],
        ].map(([label, count], index) => (
          <span
            key={String(label)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 py-2",
              index === 0
                ? "border-[#f78166] font-semibold text-[var(--gh-fg)]"
                : "border-transparent",
            )}
          >
            {label}
            <span className="rounded-full bg-[var(--gh-bg-3)] px-1.5 text-[11px]">{count}</span>
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1 py-2">
          <span className="text-[var(--gh-green)]">+{pr.added}</span>
          <span className="text-[var(--gh-red)]">−{pr.removed}</span>
        </span>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-[minmax(0,1fr)_11rem]">
        <div className="flex flex-col gap-3">
          <Comment who="michael" name={issue.asker} when="2 minutes ago">
            <p className="m-0">{pr.body}</p>
            <p className={cn("m-0 text-xs", muted)}>{pr.signature}</p>
          </Comment>
          <ol className={cn("m-0 ml-8 flex list-none flex-col gap-1 p-0 text-xs", muted)}>
            {pr.commits.map(({ sha, message }) => (
              <li key={sha} className="flex gap-2">
                <code className="text-[var(--gh-link)]">{sha}</code>
                <span className="text-[var(--gh-fg)]">{message}</span>
              </li>
            ))}
          </ol>
          <div
            className={cn(
              "ml-8 flex flex-col divide-y rounded-md border",
              border,
              "divide-[var(--gh-border)]",
            )}
          >
            <div className="flex items-start gap-2.5 px-3 py-2.5">
              {passed ? (
                <Check className="mt-0.5 size-4 shrink-0 text-[var(--gh-green)]" />
              ) : (
                <span className="mt-1 size-3 shrink-0 rounded-full bg-[var(--gh-yellow)]" />
              )}
              <span>
                <b className="font-semibold">
                  {passed ? "All checks have passed" : "Some checks haven't completed yet"}
                </b>
                <br />
                <span className={muted}>
                  1 {passed ? "successful" : "in progress"} check: CI / check (pull_request)
                </span>
              </span>
            </div>
            <div className="flex items-start gap-2.5 px-3 py-2.5">
              <span className="mt-1 size-3 shrink-0 rounded-full bg-[var(--gh-yellow)]" />
              <span>
                <b className="font-semibold">Review required</b>
                <br />
                <span className={muted}>
                  At least 1 approving review is required by reviewers with write access.
                </span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 bg-[var(--gh-bg-2)] px-3 py-2.5">
              <span
                className={cn(
                  "rounded-md border px-3 py-1 text-xs font-semibold opacity-60",
                  border,
                  passed ? "bg-[var(--gh-green-bg)] text-white" : "bg-[var(--gh-bg-3)]",
                )}
              >
                Merge pull request
              </span>
              <span className={cn("text-xs", muted)}>
                Merging is blocked until a reviewer approves.
              </span>
            </div>
          </div>
        </div>
        <aside className="flex flex-col gap-3">
          <Side title="Reviewers">
            <span className={muted}>No reviews</span>
          </Side>
          <Side title="Labels">
            <span className={muted}>None yet</span>
          </Side>
          <Side title="Development">
            <span className="flex items-start gap-1.5 text-[var(--gh-link)]">
              <CircleDot className="mt-0.5 size-3.5 shrink-0 text-[var(--gh-green)]" />
              Closes #{issue.number} {issue.title}
            </span>
          </Side>
        </aside>
      </div>
    </Page>
  );
}
