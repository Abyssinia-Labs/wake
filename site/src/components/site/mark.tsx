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

/** GitHub's mark as a stroke icon, since lucide ships no brand icons. */
export function GitHubMark(props: SVGProps<SVGSVGElement>): React.JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}
