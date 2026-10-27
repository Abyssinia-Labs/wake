import { cn } from "@/lib/utils";
import type { WakeTheme } from "@/lib/wake-theme";
import { owl12, owlBody, owlOpen, owlShut, wordmark } from "./logo-pixels";
import { spritePath } from "./sprites";

// Wake's logo, locked in on 2026-10-24 (wake-cloud's brief, "The logo"):
// one owl, the same shape everywhere. On wakectl.dev and app.wakectl.dev it
// is D, the owl alone in the theme's ink (--wk-mark, themes.css), so it
// changes colour with the theme and never shape. It blinks now and then
// (looks.css). Wake for GitHub's avatar is B, the owl on the orange case.

type Props = { className?: string };

/** D: the owl in the theme's ink, sized by its className (crisp at 16 and 32 px). */
export function Mark({ className }: Props): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={cn("wk-mark", className)}
    >
      <path d={spritePath(owlBody)} />
      <path className="wk-open" d={spritePath(owlOpen)} />
      <path className="wk-shut" d={spritePath(owlShut)} />
    </svg>
  );
}

const NAME = wordmark("wakectl");

/** The name, drawn on the owl's grid in the ink around it (currentColor), 7 pixels tall. */
export function Wordmark({ className }: Props): React.JSX.Element {
  return (
    <svg
      role="img"
      aria-label="wakectl"
      viewBox={`0 0 ${NAME.width} ${NAME.height}`}
      shapeRendering="crispEdges"
      fill="currentColor"
      className={className}
    >
      <path d={spritePath(NAME)} />
    </svg>
  );
}

/**
 * The mark beside its name, as the header and footer show it. Burrow draws
 * the name on the owl's grid, its own pixel face; Annunciator and Signal
 * set it in their display faces (looks.css), as they set every heading.
 */
export function Logo({ className }: Props): React.JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Mark className="size-8" />
      <Wordmark className="for-theme for-burrow h-[21px] w-[90px]" />
      <span className="wk-name for-theme for-annunciator for-signal">wakectl</span>
    </span>
  );
}

/** B: the owl on the orange case, Wake for GitHub's logo and avatar; the same in every theme. */
export function CaseMark({ className }: Props): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 32 32"
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width="32" height="32" rx="7" fill="#f47a3e" shapeRendering="geometricPrecision" />
      <path fill="#1f2a1a" d={spritePath(owl12, 4, 4, 2)} />
    </svg>
  );
}

/** A theme's own D on a swatch of its page, for the theme picker. */
export function ThemeChip({ theme, className }: Props & { theme: WakeTheme }): React.JSX.Element {
  return (
    <span className={cn("wk-chip", `wk-chip-${theme}`, className)}>
      <Mark className="size-4" />
    </span>
  );
}
