import { Mark } from "@/components/site/mark";
import { Separator } from "@/components/ui/separator";

const columns: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Docs",
    links: [
      { label: "Getting started", href: "/start/getting-started/" },
      { label: "How it works", href: "/start/how-it-works/" },
      { label: "Commands", href: "/reference/commands/" },
      { label: "Security", href: "/guides/security/" },
    ],
  },
  {
    title: "For apps",
    links: [
      { label: "Serve wake/v1", href: "/apps/overview/" },
      { label: "The Convex component", href: "/apps/convex/" },
      { label: "On Postgres or SQLite", href: "/apps/postgres/" },
      { label: "The spec", href: "/spec/wake-v1/" },
    ],
  },
  {
    title: "Project",
    links: [
      { label: "GitHub", href: "https://github.com/Abyssinia-Labs/wake" },
      { label: "npm", href: "https://www.npmjs.com/package/@abyssinia-labs/wake" },
      { label: "Releases", href: "https://github.com/Abyssinia-Labs/wake/releases" },
      { label: "Security policy", href: "https://github.com/Abyssinia-Labs/wake/security" },
    ],
  },
];

/** The landing page's footer. Docs pages end on Starlight's meta line instead. */
export function SiteFooter(): React.JSX.Element {
  return (
    <footer className="not-content flex flex-col gap-8 border-t pt-12 pb-8">
      <div className="flex flex-wrap justify-between gap-10">
        <div className="flex basis-72 flex-col gap-3">
          <span className="inline-flex items-center gap-2.5 font-display text-lg font-extrabold text-foreground">
            <Mark className="size-[22px]" />
            wakectl
          </span>
          <p className="m-0 max-w-[19rem] text-sm leading-relaxed text-muted-foreground">
            The client half of the Wake pattern. Open source, MIT, by Abyssinia Labs.
          </p>
        </div>
        {columns.map(({ title, links }) => (
          <div key={title} className="flex min-w-36 flex-col gap-2.5 text-sm">
            <span className="font-semibold text-foreground">{title}</span>
            {links.map(({ label, href }) => (
              <a
                key={href}
                href={href}
                className="text-muted-foreground no-underline hover:text-foreground"
              >
                {label}
              </a>
            ))}
          </div>
        ))}
      </div>
      <Separator />
      <div className="flex flex-wrap justify-between gap-4 text-[13px] text-muted-foreground">
        <span>© 2026 Abyssinia Labs</span>
        <span>wake/v1 is an open protocol. Wake names no app.</span>
      </div>
    </footer>
  );
}
