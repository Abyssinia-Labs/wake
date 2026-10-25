// Wake's three themes, as Wake on the web names them (its
// src/features/theme/themes.ts). A theme changes how the site looks, never
// what it says. Burrow is the default, the owner's call of 2026-10-22. Light
// and dark stay Starlight's; only the theme is kept here, per browser.

export const THEMES = ["annunciator", "burrow", "signal"] as const;
export type WakeTheme = (typeof THEMES)[number];
export const DEFAULT_THEME: WakeTheme = "burrow";

export const THEME_NAMES: Record<WakeTheme, string> = {
  annunciator: "Annunciator",
  burrow: "Burrow",
  signal: "Signal",
};

export const THEME_LINES: Record<WakeTheme, string> = {
  annunciator: "A flight deck’s caution panel",
  burrow: "Every run is a creature that wakes",
  signal: "Shapes in poster colours",
};

/** localStorage, beside Starlight's `starlight-theme`: the site is static, so no cookie reaches a server. */
export const THEME_KEY = "wake-theme";

export function asTheme(value: unknown): WakeTheme {
  return THEMES.find((one) => one === value) ?? DEFAULT_THEME;
}

/** Each theme's favicon: the owl in its ink, light or dark as the browser is (public/). */
export function faviconOf(theme: WakeTheme): string {
  return `/favicon-${theme}.svg`;
}

/** Points the page's icon at the theme's favicon. */
export function showFavicon(theme: WakeTheme): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (link) link.href = faviconOf(theme);
}

/**
 * The head script: puts the kept theme on <html> before the page paints,
 * and its favicon on the tab once the icon's link is parsed. Storage can
 * throw (a private window, blocked site data); the default stands then.
 */
export const wakeThemeScript = `(() => {
  let kept = null;
  try { kept = localStorage.getItem(${JSON.stringify(THEME_KEY)}); } catch {}
  const themes = ${JSON.stringify(THEMES)};
  const theme = themes.includes(kept) ? kept : ${JSON.stringify(DEFAULT_THEME)};
  document.documentElement.dataset.wakeTheme = theme;
  const icon = () => {
    const link = document.querySelector('link[rel~="icon"]');
    if (link) link.href = "/favicon-" + theme + ".svg";
  };
  icon();
  document.addEventListener("DOMContentLoaded", icon);
})();`;
