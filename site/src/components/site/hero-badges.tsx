import { ArrowRight } from "lucide-react";
import { ClaudeCodeMark, CodexMark, CursorMark } from "@/components/site/logos";
import { Badge } from "@/components/ui/badge";
import { inline } from "@/lib/changelog";

const tools = [
  { name: "Claude Code", Mark: ClaudeCodeMark },
  { name: "Codex", Mark: CodexMark },
  { name: "Cursor", Mark: CursorMark },
];

export type News = { version: string; headline: string; href: string };

/** The row over the headline: what's new in the release on npm, the platforms, the agents it starts. */
export function HeroBadges({ news }: { news: News }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Wraps, unlike a badge: a headline is longer than a phone is wide. */}
      <a
        href={news.href}
        className="group inline-flex max-w-full items-center gap-2 rounded-2xl bg-ink-a-soft py-0.5 pr-2.5 pl-0.5 text-xs font-medium text-link no-underline"
      >
        <span className="shrink-0 rounded-full bg-ink-a px-2 py-0.5 text-on-ink-a">
          v{news.version}
        </span>
        <span
          className="min-w-0 [&_code]:font-mono [&_code]:text-[11px]"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: inline() escapes it first.
          dangerouslySetInnerHTML={{ __html: inline(news.headline.replace(/\.$/, "")) }}
        />
        <ArrowRight
          aria-hidden="true"
          className="size-3 shrink-0 transition-transform group-hover:translate-x-0.5"
        />
      </a>
      <Badge variant="outline" className="text-muted-foreground">
        macOS · Linux
      </Badge>
      {tools.map(({ name, Mark }) => (
        <Badge key={name} variant="outline" className="gap-1.5 text-muted-foreground">
          <Mark className="size-3 text-foreground" />
          {name}
        </Badge>
      ))}
    </div>
  );
}
