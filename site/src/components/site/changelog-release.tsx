import { Badge } from "@/components/ui/badge";
import { type Group, inline, type Log, longDate } from "@/lib/changelog";
import { cn } from "@/lib/utils";

// Each category in the page's inks: what's new filled with the first,
// security outlined in the second (text stays the page's ink, which reads
// on both papers), the rest outlined plainly.
const CATEGORY: Record<Group["category"], string> = {
  Added: "border-transparent bg-ink-a-soft text-link",
  Changed: "text-foreground",
  Deprecated: "text-muted-foreground",
  Removed: "text-muted-foreground",
  Fixed: "text-foreground",
  Security: "border-ink-b font-semibold text-foreground",
};

/** One version: its heading (the anchor `wakectl update` links to), its date, its entries. */
export function ChangelogRelease({
  release,
  level = 2,
  newest = false,
}: {
  release: Log["releases"][number];
  level?: 2 | 3;
  newest?: boolean;
}): React.JSX.Element {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section className="changelog-release">
      <Heading id={release.anchor} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono">{release.version}</span>
        {newest && (
          <Badge className="border-transparent bg-ink-a text-on-ink-a align-middle">Latest</Badge>
        )}
      </Heading>
      {release.date && (
        <p className="changelog-date">
          <time dateTime={release.date}>{longDate(release.date)}</time>
        </p>
      )}
      {release.groups.map((group) => (
        <div key={group.category} className="changelog-group">
          <Badge variant="outline" className={cn(CATEGORY[group.category])}>
            {group.category}
          </Badge>
          <ul>
            {group.entries.map((entry) => (
              <li
                key={entry.headline}
                // The repository's own file, escaped by inline().
                // biome-ignore lint/security/noDangerouslySetInnerHtml: inline() escapes it first.
                dangerouslySetInnerHTML={{
                  __html: `<strong>${inline(entry.headline)}</strong>${entry.body ? ` ${inline(entry.body)}` : ""}`,
                }}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
