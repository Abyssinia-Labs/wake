import { Download } from "lucide-react";
import { Chip } from "@/components/site/text";
import { buttonVariants } from "@/components/ui/button";
import { type MacBuild, macDownload, macOS, megabytes } from "@/lib/mac";
import { cn } from "@/lib/utils";

/**
 * Wake for Mac's download: the button, the build it serves and what the app
 * is. Without mac.json the button stands alone: Wake.dmg is the newest build.
 */
export function MacDownload({
  build,
  className,
}: {
  build: MacBuild | null;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("not-content flex flex-col gap-2.5", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={macDownload}
          className={cn(buttonVariants({ variant: "outline" }), "text-foreground no-underline")}
        >
          <Download />
          Download for Mac
        </a>
        {build && (
          <span className="font-mono text-xs text-muted-foreground">
            {build.version} · {megabytes(build.sizeBytes)}
          </span>
        )}
      </div>
      <p className="m-0 text-sm leading-relaxed text-muted-foreground">
        <strong className="font-semibold text-foreground">Wake for Mac</strong> is the menu bar app
        over the same Wake: it carries <Chip>wakectl</Chip> and runs the listener. It needs{" "}
        {macOS(build)} or later, and updates itself, so the command updates with it.
      </p>
    </div>
  );
}
