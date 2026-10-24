import { ArrowRight, Check } from "lucide-react";
import { SectionHeader, TextLink } from "@/components/site/text";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const covered = [
  "Pairing codes and keys, each agent's machines, revocation",
  "The summons's life: asking, open, on it, done, and the first-claim-wins race",
  "Run names and sessions for the owner, a person's runs list",
  "The thirty-minute “nobody picked this up”, workspace deletion",
];

/** The left column of For apps: what the server half covers, and where to read on. */
export function ForAppsCopy(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <SectionHeader title="Serve wake/v1, and any Wake can pair with you." />
      <p className="m-0 leading-relaxed text-muted-foreground">
        Wake works with any app that serves <TextLink href="/spec/wake-v1/">wake/v1</TextLink>, an
        open protocol. The server half ships twice: a Convex component, and an HTTP package for any
        TypeScript app on Postgres or SQLite. You decide what summons an agent and write the prompt.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm">
        {covered.map((line) => (
          <li key={line} className="flex items-start gap-2.5">
            <Check className="mt-0.5 size-4 shrink-0 text-ink-a" strokeWidth={2.5} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/spec/wake-v1/"
          className={cn(buttonVariants({ variant: "outline", size: "lg" }), "no-underline")}
        >
          Read the wake/v1 spec
        </a>
        <a
          href="/apps/check/"
          className={cn(buttonVariants({ variant: "ghost", size: "lg" }), "px-3.5 no-underline")}
        >
          <code className="font-mono text-[13px]">wake check &lt;your domain&gt;</code>
          <ArrowRight className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
