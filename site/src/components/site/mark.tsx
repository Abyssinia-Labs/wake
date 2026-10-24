import type { SVGProps } from "react";
import { cn } from "@/lib/utils";
import type { WakeTheme } from "@/lib/wake-theme";
import { owl, spritePath } from "./sprites";

type Props = SVGProps<SVGSVGElement> & { className?: string };

/** Burrow: the app icon in small, the owl on the screen in the orange case. */
function BurrowMark({ className, ...props }: Props): React.JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" className={className} {...props}>
      <rect width="32" height="32" rx="7" fill="#f47a3e" />
      <rect x="1" y="1" width="30" height="15" rx="6" fill="#ff9b63" opacity="0.5" />
      <rect x="4" y="4" width="24" height="19" rx="2" fill="#c8d0b0" />
      <path d={spritePath(owl, 8, 5)} fill="#1f2a1a" shapeRendering="crispEdges" />
      <g fill="#1f2a1a" opacity="0.45">
        <circle cx="12" cy="27" r="1" />
        <circle cx="16" cy="27" r="1" />
        <circle cx="20" cy="27" r="1" />
      </g>
    </svg>
  );
}

/** Annunciator: two legends behind smoked glass, the top one lit green. */
function AnnunciatorMark({ className, ...props }: Props): React.JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" className={className} {...props}>
      <rect width="32" height="32" rx="7" fill="#2a3034" />
      <rect x="3" y="3" width="26" height="26" rx="4.5" fill="#121517" />
      <rect x="6" y="6.5" width="20" height="9" rx="2" fill="#39d98a" />
      <rect x="9" y="8.5" width="14" height="4" rx="1.5" fill="#b4ffda" opacity="0.6" />
      <rect x="6" y="17.5" width="20" height="8" rx="2" fill="#24292c" stroke="#3a4146" />
    </svg>
  );
}

/** Signal: a circle, which is a run. */
function SignalMark({ className, ...props }: Props): React.JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" className={className} {...props}>
      <circle cx="16" cy="16" r="14" style={{ fill: "var(--wk-run, #1f3bff)" }} />
    </svg>
  );
}

const MARKS = { annunciator: AnnunciatorMark, burrow: BurrowMark, signal: SignalMark };

/**
 * The wakectl mark, sized by its className: one theme's when `theme` is
 * given, else all three, each shown only while its theme is on (looks.css).
 */
export function Mark({
  theme,
  className,
  ...props
}: Props & { theme?: WakeTheme }): React.JSX.Element {
  if (theme) {
    const One = MARKS[theme];
    return <One className={className} {...props} />;
  }
  return (
    <>
      <BurrowMark className={cn("for-theme for-burrow", className)} {...props} />
      <AnnunciatorMark className={cn("for-theme for-annunciator", className)} {...props} />
      <SignalMark className={cn("for-theme for-signal", className)} {...props} />
    </>
  );
}
