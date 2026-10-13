// Expressive Code renders the site's code blocks; its own copy button is
// turned off (ec.config.mjs) and this plugin puts a shadcn Button in its
// place: the ghost icon-button recipe from components/ui/button.tsx, with
// lucide's copy and check icons, and a few lines of script that copy the
// block's code. Newlines travel in `data-code` as DEL, as Expressive Code's
// button does, so the attribute stays one line. Plain JavaScript, since
// ec.config.mjs is loaded without a bundler.
import { definePlugin } from "@astrojs/starlight/expressive-code";

/**
 * @typedef {{ type: string; tagName?: string; properties?: Record<string, unknown>; children?: Hast[] }} Hast
 */

/**
 * @param {string} tagName
 * @param {Record<string, unknown>} properties
 * @param {Hast[]} [children]
 * @returns {Hast}
 */
const el = (tagName, properties, children = []) => ({
  type: "element",
  tagName,
  properties,
  children,
});

// `buttonVariants({ variant: "ghost", size: "icon-xs" })`, as a string, plus the
// border, background, padding and cursor Starlight reverts inside a code block.
const BUTTON =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground size-6 cursor-pointer border-0 bg-transparent p-0 [&_svg:not([class*='size-'])]:size-3 text-muted-foreground";

/** @param {Hast[]} paths */
const icon = (paths) =>
  el(
    "svg",
    {
      ariaHidden: "true",
      focusable: "false",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    },
    paths,
  );

const copyIcon = icon([
  el("rect", { width: "14", height: "14", x: "8", y: "8", rx: "2", ry: "2" }),
  el("path", { d: "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" }),
]);
const checkIcon = icon([el("path", { d: "M20 6 9 17l-5-5" })]);

const script = `
document.addEventListener("click", async (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const button = target?.closest("button[data-wake-copy]");
  if (!(button instanceof HTMLButtonElement)) return;
  const code = (button.dataset.code ?? "").replace(/\\u007f/g, "\\n");
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    return;
  }
  button.dataset.copied = "";
  button.setAttribute("aria-label", "Copied");
  setTimeout(() => {
    delete button.dataset.copied;
    button.setAttribute("aria-label", "Copy to clipboard");
  }, 1500);
});
`;

/* The button sits in the frame's top-right: in the header's row when the
   frame has one, over the code's first line otherwise. */
const styles = `
.frame { position: relative; }
.wake-copy {
  position: absolute;
  inset-inline-end: calc(var(--ec-brdWd) + var(--ec-uiPadInl));
  inset-block-start: calc(var(--ec-brdWd) + var(--ec-codePadBlk) - 0.125rem);
  z-index: 1;
}
.frame.has-title .wake-copy,
.frame.is-terminal .wake-copy {
  inset-block-start: calc(var(--ec-brdWd) + var(--ec-uiPadBlk) + (var(--ec-uiLineHt) * var(--ec-uiFontSize) - 1.5rem) / 2);
}
.wake-copy button svg:last-child { display: none; }
.wake-copy button[data-copied] svg:first-child { display: none; }
.wake-copy button[data-copied] svg:last-child { display: block; }
`;

export function wakeCopyButton() {
  return definePlugin({
    name: "Wake copy button",
    baseStyles: styles,
    jsModules: [script],
    hooks: {
      postprocessRenderedBlock: ({ codeBlock, renderData }) => {
        /** @type {Hast} */
        const figure = /** @type {Hast} */ (/** @type {unknown} */ (renderData.blockAst));
        if (figure.tagName !== "figure" || !figure.children) return;
        const button = el(
          "button",
          {
            type: "button",
            className: BUTTON.split(" "),
            dataWakeCopy: "",
            dataCode: codeBlock.code.replace(/\n/g, "\u007f"),
            ariaLabel: "Copy to clipboard",
            title: "Copy to clipboard",
          },
          [copyIcon, checkIcon],
        );
        figure.children.push(el("div", { className: ["wake-copy"] }, [button]));
      },
    },
  });
}
