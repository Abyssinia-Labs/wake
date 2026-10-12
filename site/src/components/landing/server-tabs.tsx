import type { ReactNode } from "react";
import { TextLink } from "@/components/site/text";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * The four ways to serve wake/v1. The code blocks arrive as named slots
 * from ForApps.astro, rendered by Expressive Code at build; every panel
 * stays mounted so their copy buttons keep their listeners.
 */
export interface ServerTabsProps {
  convex?: ReactNode;
  postgres?: ReactNode;
  sqlite?: ReactNode;
  http?: ReactNode;
}

const tabs: { id: keyof ServerTabsProps; label: string; pkg: string; note: ReactNode }[] = [
  {
    id: "convex",
    label: "Convex",
    pkg: "@abyssinia-labs/wake-convex",
    note: (
      <>
        The whole server half, its own tables beside yours. Gatherd and Antescript run on it.{" "}
        <TextLink href="/apps/convex/">The Convex component</TextLink>
      </>
    ),
  },
  {
    id: "postgres",
    label: "Postgres",
    pkg: "@abyssinia-labs/wake-server",
    note: (
      <>
        Drizzle on Postgres, any driver; the pending list comes as server-sent events.{" "}
        <TextLink href="/apps/postgres/">On Postgres or SQLite</TextLink>
      </>
    ),
  },
  {
    id: "sqlite",
    label: "SQLite · D1",
    pkg: "@abyssinia-labs/wake-server",
    note: (
      <>
        The same package on SQLite. On D1 an idle app costs next to nothing.{" "}
        <TextLink href="/apps/postgres/#on-cloudflare-d1">On Cloudflare D1</TextLink>
      </>
    ),
  },
  {
    id: "http",
    label: "Any HTTP app",
    pkg: "wake/v1 over HTTP",
    note: (
      <>
        Serve discovery and the four routes anywhere the Fetch API runs, then{" "}
        <TextLink href="/apps/check/">check your app</TextLink> against the spec.
      </>
    ),
  },
];

export function ServerTabs(props: ServerTabsProps): React.JSX.Element {
  return (
    <Tabs defaultValue="convex" className="gap-0 rounded-xl border bg-card shadow-xs">
      <TabsList className="m-4 mb-0 flex-wrap">
        {tabs.map(({ id, label }) => (
          <TabsTrigger key={id} value={id} className="flex-none px-3">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map(({ id, pkg, note }) => (
        <TabsContent
          key={id}
          value={id}
          forceMount
          className="flex flex-col gap-3 p-4 data-[state=inactive]:hidden"
        >
          <Badge
            variant="outline"
            className="font-mono text-[11px] font-normal text-muted-foreground"
          >
            {pkg}
          </Badge>
          {props[id]}
          <p className="m-0 text-[13px] leading-relaxed text-muted-foreground">{note}</p>
        </TabsContent>
      ))}
    </Tabs>
  );
}
