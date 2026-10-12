import { Badge } from "@/components/ui/badge";

/** The row over the headline: the release on npm, the platforms, the agents. */
export function HeroBadges({ version }: { version: string }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className="gap-1.5 border-transparent bg-ink-a-soft text-link">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-a" />v{version} on npm
      </Badge>
      <Badge variant="outline" className="text-muted-foreground">
        macOS · Linux
      </Badge>
      <Badge variant="outline" className="text-muted-foreground">
        Claude Code · Codex · Cursor
      </Badge>
    </div>
  );
}
