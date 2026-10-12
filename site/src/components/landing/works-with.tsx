import { ArrowRight } from "lucide-react";
import { GitHubMark } from "@/components/site/logos";
import { Chip } from "@/components/site/text";

const item = "inline-flex items-center gap-2 text-sm font-semibold text-foreground no-underline";

/** The strip under the hero: the apps that serve wake/v1 today. */
export function WorksWith(): React.JSX.Element {
  return (
    <section aria-label="Works with" className="not-content border-y py-4">
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
        <span className="font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">
          Works with
        </span>
        <a href="/guides/github/" className={item}>
          <GitHubMark className="size-4" />
          GitHub
          <span className="font-normal text-muted-foreground">
            label an issue <Chip>wake</Chip>
          </span>
        </a>
        <a href="https://gatherd.dev" className={item}>
          <span aria-hidden="true" className="size-2 rounded-sm bg-ink-a" />
          Gatherd
        </a>
        <a href="https://antescript.app" className={item}>
          <span aria-hidden="true" className="size-2 rounded-full bg-ink-b" />
          Antescript
        </a>
        <a
          href="/spec/wake-v1/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-link no-underline hover:text-foreground sm:ml-auto"
        >
          Any app that serves wake/v1
          <ArrowRight className="size-3.5" />
        </a>
      </div>
    </section>
  );
}
