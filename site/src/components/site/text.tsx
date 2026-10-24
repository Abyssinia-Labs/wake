import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Inline code as a chip, for copy outside Starlight's markdown styles. */
export function Chip({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <code className="rounded border bg-muted px-1.5 py-px font-mono text-[0.8em] text-foreground">
      {children}
    </code>
  );
}

/** A link in running copy: the link ink, underlined on hover. */
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}): React.JSX.Element {
  return (
    <a href={href} className="text-link no-underline underline-offset-4 hover:underline">
      {children}
    </a>
  );
}

/** A section's title in the theme's display face and an optional lead. No eyebrow over it: they crowd the page. */
export function SectionHeader({
  title,
  lead,
  className,
}: {
  title: string;
  lead?: string;
  className?: string;
}): React.JSX.Element {
  return (
    <div className={cn("flex max-w-[42rem] flex-col gap-3", className)}>
      <h2 className="m-0 font-display text-[2.375rem] leading-[1.1] font-bold tracking-[-0.02em] text-foreground">
        {title}
      </h2>
      {lead && <p className="m-0 leading-relaxed text-muted-foreground">{lead}</p>}
    </div>
  );
}
