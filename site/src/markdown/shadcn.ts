// Markdown has no components, so its tables and asides take shadcn's
// recipes here, as a Sätteri hast plugin (Astro 7's Markdown processor):
// the class strings of shadcn's Table and Alert, on the elements Starlight
// renders. Sätteri's nodes are read-only, so every change goes through its
// context. Two departures from the recipes, both for prose: cells wrap
// instead of `whitespace-nowrap`, and the header row reads muted, as the
// docs design draws it.

type Node = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

type Context = {
  parent(node: Node): Node | undefined;
  setProperty(node: Node, key: string, value: unknown): void;
  replaceNode(node: Node, newNode: Node | Node[]): void;
  prependChild(node: Node, child: Node | Node[]): void;
  wrapNode(node: Node, parent: Node): void;
};

type Visitor = { filter: string[]; visit(node: Node, ctx: Context): void };

const classesOf = (node: Node): string[] => {
  const value = node.properties?.class ?? node.properties?.className;
  if (Array.isArray(value)) return value.map(String);
  return typeof value === "string" ? value.split(/\s+/).filter(Boolean) : [];
};

const addClasses = (ctx: Context, node: Node, recipe: string): void =>
  ctx.setProperty(node, "class", [...classesOf(node), recipe].join(" "));

const TABLE: Record<string, string> = {
  table: "table w-full border-collapse caption-bottom text-sm",
  thead: "[&_tr]:border-b",
  tbody: "[&_tr:last-child]:border-0",
  tr: "border-b transition-colors hover:bg-muted/50",
  th: "h-10 px-3 text-left align-middle font-medium whitespace-nowrap text-muted-foreground",
  td: "p-3 align-top [overflow-wrap:anywhere]",
};

const ALERT =
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border bg-card px-4 py-3 text-sm text-card-foreground has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5";
const ALERT_ICON: Record<string, string> = {
  note: "[&>svg]:text-ink-a",
  tip: "[&>svg]:text-ink-a",
  caution: "[&>svg]:text-ink-b",
  danger: "[&>svg]:text-ink-b",
};
const ALERT_TITLE = "col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight";
const ALERT_BODY =
  "col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed";

/** The table goes into a scrolling, rounded container; its parts take the recipe below. */
function table(node: Node, ctx: Context): void {
  addClasses(ctx, node, TABLE.table ?? "");
  if (ctx.parent(node)?.properties?.["data-slot"] === "table-container") return;
  ctx.wrapNode(node, {
    type: "element",
    tagName: "div",
    properties: {
      "data-slot": "table-container",
      class: "relative w-full overflow-x-auto rounded-lg border",
    },
    children: [],
  });
}

/** Starlight's `<aside class="starlight-aside starlight-aside--note">` becomes an Alert. */
function aside(node: Node, ctx: Context): void {
  const kind = classesOf(node)
    .find((name) => name.startsWith("starlight-aside--"))
    ?.replace("starlight-aside--", "");
  if (!kind) return;
  const title = node.children?.find((child) => classesOf(child).includes("starlight-aside__title"));
  const body = node.children?.find((child) =>
    classesOf(child).includes("starlight-aside__content"),
  );
  if (!title || !body) return;
  // The icon is the title's first child: an <svg>, or the raw HTML of one in plain Markdown.
  const first = title.children?.[0];
  const icon = first && (first.tagName === "svg" || first.type === "raw") ? first : undefined;
  ctx.replaceNode(title, {
    type: "element",
    tagName: "div",
    properties: { "data-slot": "alert-title", "aria-hidden": "true", class: ALERT_TITLE },
    children: (title.children ?? []).slice(icon ? 1 : 0),
  });
  if (icon) ctx.prependChild(node, icon);
  ctx.setProperty(body, "data-slot", "alert-description");
  ctx.setProperty(body, "class", ALERT_BODY);
  ctx.setProperty(node, "data-slot", "alert");
  ctx.setProperty(node, "class", `${ALERT} ${ALERT_ICON[kind] ?? ""}`.trim());
}

/** A Sätteri hast plugin for astro.config.mjs: `satteri({ hastPlugins: [shadcnMarkdown()] })`. */
export function shadcnMarkdown(): { name: string; element: Visitor[] } {
  const parts: Visitor[] = ["thead", "tbody", "tr", "th", "td"].map((tag) => ({
    filter: [tag],
    visit: (node, ctx) => addClasses(ctx, node, TABLE[tag] ?? ""),
  }));
  return {
    name: "wake-shadcn",
    element: [
      { filter: ["table"], visit: table },
      ...parts,
      {
        filter: ["aside"],
        visit: (node, ctx) => {
          if (classesOf(node).includes("starlight-aside")) aside(node, ctx);
        },
      },
    ],
  };
}
