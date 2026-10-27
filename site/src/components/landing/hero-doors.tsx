import { ArrowRight, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface HeroDoor {
  id: string;
  label: string;
  lead: string;
  points: { title: string; text: string }[];
  actions: { text: string; link: string; variant: "primary" | "secondary" }[];
}

/**
 * The hero's doors, one for each kind of visitor: someone who builds a
 * product and someone who writes code each get what Wake gives them and
 * where to go next, under the one headline. Each door's install line sits
 * beside this island in Hero.astro, not in it: Expressive Code's stylesheet
 * is dropped from a code block rendered into an island's slot. hero.css
 * shows the one whose tab is open, by each tab's `data-door`. Every panel
 * stays mounted, so a reader without scripts finds both doors' words.
 */
export function HeroDoors({ doors }: { doors: HeroDoor[] }): React.JSX.Element | null {
  const first = doors[0];
  if (!first) return null;
  return (
    <Tabs defaultValue={first.id} className="gap-5">
      <TabsList aria-label="Who you are" className="h-10 max-w-full">
        {doors.map(({ id, label }) => (
          <TabsTrigger key={id} value={id} data-door={id} className="flex-none px-4 text-base">
            {label}
          </TabsTrigger>
        ))}
      </TabsList>
      {doors.map((door) => (
        <TabsContent
          key={door.id}
          value={door.id}
          forceMount
          className="flex max-w-[36rem] flex-col gap-5 data-[state=inactive]:hidden"
        >
          <p className="font-display m-0 text-2xl leading-tight font-semibold text-foreground">
            {door.lead}
          </p>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm leading-relaxed">
            {door.points.map(({ title, text }) => (
              <li key={title} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-ink-a" strokeWidth={2.5} />
                <span>
                  <strong className="font-semibold text-foreground">{title}</strong>{" "}
                  <span className="text-muted-foreground">{text}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            {door.actions.map(({ text, link, variant }) => (
              <a
                key={link}
                href={link}
                className={cn(
                  buttonVariants({
                    variant: variant === "primary" ? "default" : "outline",
                    size: "lg",
                  }),
                  // Starlight runs without preflight, so a link keeps the browser's
                  // blue unless a class gives it ink; only the primary one has its own.
                  variant !== "primary" && "text-foreground",
                  "no-underline",
                )}
              >
                {text}
                {variant === "primary" && <ArrowRight />}
              </a>
            ))}
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
