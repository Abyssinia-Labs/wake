import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The release this site documents, at the foot of the docs sidebar, and what it brought. */
export function VersionCard({
  version,
  href,
}: {
  version: string;
  href: string;
}): React.JSX.Element {
  return (
    <Card className="mt-2 gap-0 rounded-lg py-3 shadow-none">
      <CardHeader className="gap-1 px-3">
        <CardTitle className="text-xs">Wake {version}</CardTitle>
        <CardDescription className="text-xs">
          <a href={href} className="text-link">
            What's new
          </a>
          . Stay current with <code className="font-mono text-[11px]">wake update</code>.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
