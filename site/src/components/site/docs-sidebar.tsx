import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

/** Starlight's sidebar entries, as its route data hands them over. */
export type SidebarEntry =
  | { type: "link"; label: string; href: string; isCurrent: boolean }
  | { type: "group"; label: string; entries: SidebarEntry[] };

/**
 * The current page's link, with a dot in the first ink. Radix's Slot hands
 * the menu button's props (its classes, `data-active`) to this element, so
 * they go onto the anchor.
 */
function Link({
  entry,
  ...props
}: {
  entry: Extract<SidebarEntry, { type: "link" }>;
} & React.ComponentProps<"a">): React.JSX.Element {
  return (
    <a {...props} href={entry.href} aria-current={entry.isCurrent ? "page" : undefined}>
      <span>{entry.label}</span>
      {entry.isCurrent && (
        <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-ink-a" />
      )}
    </a>
  );
}

function Items({ entries }: { entries: SidebarEntry[] }): React.JSX.Element {
  return (
    <SidebarMenu>
      {entries.map((entry) =>
        entry.type === "link" ? (
          <SidebarMenuItem key={entry.href}>
            <SidebarMenuButton asChild isActive={entry.isCurrent} className="text-muted-foreground">
              <Link entry={entry} />
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : (
          <SidebarMenuItem key={entry.label}>
            <SidebarMenuButton className="font-medium text-foreground">
              <span>{entry.label}</span>
            </SidebarMenuButton>
            <SidebarMenuSub>
              {entry.entries.map((child) =>
                child.type === "link" ? (
                  <SidebarMenuSubItem key={child.href}>
                    <SidebarMenuSubButton asChild isActive={child.isCurrent}>
                      <Link entry={child} />
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ) : null,
              )}
            </SidebarMenuSub>
          </SidebarMenuItem>
        ),
      )}
    </SidebarMenu>
  );
}

/**
 * The docs navigation on shadcn's Sidebar: a group per sidebar section, a
 * menu button per page. The provider is shadcn's own, with its full-height
 * wrapper flattened, since Starlight's pane already frames the sidebar.
 */
export function DocsSidebar({ entries }: { entries: SidebarEntry[] }): React.JSX.Element {
  return (
    <SidebarProvider className="block min-h-0 w-full">
      <SidebarContent className="gap-4 overflow-visible">
        {entries.map((entry) =>
          entry.type === "group" ? (
            <SidebarGroup key={entry.label} className="p-0">
              <SidebarGroupLabel className="text-muted-foreground">{entry.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <Items entries={entry.entries} />
              </SidebarGroupContent>
            </SidebarGroup>
          ) : (
            <SidebarGroup key={entry.href} className="p-0">
              <Items entries={[entry]} />
            </SidebarGroup>
          ),
        )}
      </SidebarContent>
    </SidebarProvider>
  );
}
