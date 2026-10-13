import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
} from "@/components/ui/sidebar";

/** A heading in Starlight's table of contents, with the headings under it. */
export type TocItem = { depth: number; slug: string; text: string; children: TocItem[] };

function Items({ items }: { items: TocItem[] }): React.JSX.Element {
  return (
    <SidebarMenuSub className="mx-0 gap-0.5 py-0">
      {items.map((item) => (
        <SidebarMenuSubItem key={item.slug}>
          <SidebarMenuSubButton asChild size="sm" className="h-auto py-1.5 text-muted-foreground">
            <a href={`#${item.slug}`}>
              <span className="whitespace-normal">{item.text}</span>
            </a>
          </SidebarMenuSubButton>
          {item.children.length > 0 && <Items items={item.children} />}
        </SidebarMenuSubItem>
      ))}
    </SidebarMenuSub>
  );
}

/**
 * "On this page" on shadcn's Sidebar sub-menu: a hairline rail with a
 * link per heading. The script in TableOfContents.astro marks the one in
 * view with `data-active`, which is the state the sub-button draws.
 */
export function DocsToc({ items, label }: { items: TocItem[]; label: string }): React.JSX.Element {
  return (
    <SidebarProvider className="block min-h-0 w-full">
      <SidebarGroup className="p-0">
        <SidebarGroupLabel id="starlight__on-this-page" className="px-0 text-foreground">
          {label}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <Items items={items} />
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarProvider>
  );
}
