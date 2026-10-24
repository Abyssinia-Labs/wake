import {
  GitBranch,
  type LucideIcon,
  Radio,
  RefreshCw,
  ShieldCheck,
  Tag,
  Terminal,
} from "lucide-react";
import type { ReactNode } from "react";
import { Chip, SectionHeader, TextLink } from "@/components/site/text";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features: { icon: LucideIcon; title: string; body: ReactNode }[] = [
  {
    icon: Terminal,
    title: "Your agents, your tools",
    body: (
      <>
        Claude Code, Codex or Cursor, whichever paired. In the background, or as a{" "}
        <TextLink href="https://herdr.dev">herdr</TextLink> tab you can watch and step into.
      </>
    ),
  },
  {
    icon: GitBranch,
    title: "The right place to work",
    body: "Wake finds your clone, makes a worktree on the ticket's branch, and keeps it, so you can pick the session up again afterwards.",
  },
  {
    icon: Tag,
    title: "Every run has a name",
    body: (
      <>
        Like <Chip>amber-heron</Chip>: on the ticket, in the herdr tab, in <Chip>wake status</Chip>.
        The app shows it's on it, and <Chip>wake open amber-heron</Chip> puts you back in the
        session.
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Fenced, not trusted",
    body: (
      <>
        A sandboxed shell, only repositories you approved, never the default branch, never
        permission checks bypassed. <TextLink href="/guides/security/">Security</TextLink>
      </>
    ),
  },
  {
    icon: Radio,
    title: "Nothing polls",
    body: "One idle subscription per app. A summons carries no text: the agent reads the ticket over its own connection.",
  },
  {
    icon: RefreshCw,
    title: "Keeps itself current",
    body: (
      <>
        <Chip>wake update</Chip> installs the newest Wake and moves the listener onto it, between
        runs. <Chip>wake doctor</Chip> says what's missing, with the fix.
      </>
    ),
  },
];

/** What you get: six cards, an icon tile in the second ink on each. */
export function Features(): React.JSX.Element {
  return (
    <section className="not-content flex flex-col gap-10 border-t py-20">
      <SectionHeader
        title="Your agent, out of bed and in the right place."
        lead="Wake is a listener on your machine. It knows the app only through wake/v1, keeps your repositories to itself, and leaves a run you can step back into."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <Card key={title} className="gap-0 py-6 shadow-xs">
            <CardHeader className="gap-3.5">
              <span
                aria-hidden="true"
                className="inline-flex size-9 items-center justify-center rounded-lg bg-muted text-ink-b"
              >
                <Icon className="size-[18px]" />
              </span>
              <CardTitle className="font-display text-lg font-bold">{title}</CardTitle>
              <CardDescription className="leading-relaxed">{body}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </section>
  );
}
