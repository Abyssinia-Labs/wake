import type { SVGProps } from "react";

/** The wakectl mark: the alarm clock in two inks, sized by its className. */
export function Mark(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" fill="none" {...props}>
      <circle cx="17.2" cy="19.2" r="9.6" className="fill-ink-b" fillOpacity="0.9" />
      <circle cx="16" cy="18" r="9.6" className="stroke-ink-a" strokeWidth="2.2" />
      <path
        d="M5.2 9.6a4.6 4.6 0 0 1 6.4-3.4M26.8 9.6a4.6 4.6 0 0 0-6.4-3.4"
        className="stroke-ink-a"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M16 18v-5.5M16 18l4 2.4M9.6 26.6l-1.9 2.6M22.4 26.6l1.9 2.6"
        className="stroke-foreground"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
