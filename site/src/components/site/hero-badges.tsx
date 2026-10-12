import { ClaudeCodeMark, CodexMark, CursorMark } from "@/components/site/logos";
import { Badge } from "@/components/ui/badge";

const tools = [
  { name: "Claude Code", Mark: ClaudeCodeMark },
  { name: "Codex", Mark: CodexMark },
  { name: "Cursor", Mark: CursorMark },
];

/** The row over the headline: the release on npm, the platforms, the agents it starts. */
export function HeroBadges({ version }: { version: string }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge className="gap-1.5 border-transparent bg-ink-a-soft text-link">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-a" />v{version} on npm
      </Badge>
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
