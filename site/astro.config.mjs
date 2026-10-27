// wakectl.dev: what Wake is, how to use it, and how an app serves wake/v1.
// Static, served by a Cloudflare Worker (wrangler.jsonc). The chrome is
// shadcn/ui on Tailwind (React, rendered to HTML at build; the one island
// is the server-half tabs on the landing page), in Wake's three themes
// (themes.css), Burrow unless a visitor picks another.

import { satteri } from "@astrojs/markdown-satteri";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { wakeThemeScript } from "./src/lib/wake-theme.ts";
import { shadcnMarkdown } from "./src/markdown/shadcn.ts";

export default defineConfig({
  site: "https://wakectl.dev",
  integrations: [
    starlight({
      title: "wakectl",
      description:
        "Wake starts your coding agent (Claude Code, Codex, Cursor) on your Mac when someone hands it work in an app.",
      // Tailwind first (it declares the cascade layers), then the themes'
      // tokens and what each draws, then Starlight's chrome and content
      // restyled to shadcn's measures.
      customCss: [
        "./src/styles/global.css",
        "./src/styles/themes.css",
        "./src/styles/looks.css",
        "./src/styles/hero.css",
        "./src/styles/hero-panel.css",
        "./src/styles/live-run.css",
        "./src/styles/live-run-screen.css",
        "./src/styles/chrome.css",
        "./src/styles/content.css",
        "./src/styles/demo.css",
      ],
      components: {
        Header: "./src/components/starlight/Header.astro",
        Hero: "./src/components/starlight/Hero.astro",
        Footer: "./src/components/starlight/Footer.astro",
        Pagination: "./src/components/starlight/Pagination.astro",
        PageTitle: "./src/components/starlight/PageTitle.astro",
        Sidebar: "./src/components/starlight/Sidebar.astro",
        Search: "./src/components/starlight/Search.astro",
        TableOfContents: "./src/components/starlight/TableOfContents.astro",
        MobileMenuFooter: "./src/components/starlight/MobileMenuFooter.astro",
      },
      // The chosen theme, set before the page paints so nothing flashes, as
      // Starlight sets light or dark (wake-theme-picker.tsx keeps it). Then
      // the owl as pictures, for what can't follow an SVG's light and dark:
      // search results, old browsers, a Home Screen. The favicons are the
      // owl in Burrow's daylight ink ringed in its paper, so they read on a
      // light or a dark page; the touch icon is the device (the logo's A).
      // A browser that takes SVG keeps the theme's favicon, as the .ico
      // names its sizes.
      head: [
        { tag: "script", content: wakeThemeScript },
        { tag: "link", attrs: { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" } },
        ...[48, 96, 192].map((size) => ({
          tag: "link",
          attrs: {
            rel: "icon",
            type: "image/png",
            sizes: `${size}x${size}`,
            href: `/favicon-${size}.png`,
          },
        })),
        { tag: "link", attrs: { rel: "apple-touch-icon", href: "/apple-touch-icon.png" } },
      ],
      favicon: "/favicon.svg",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/Abyssinia-Labs/wake" }],
      editLink: { baseUrl: "https://github.com/Abyssinia-Labs/wake/edit/main/site/" },
      lastUpdated: true,
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Getting started", slug: "start/getting-started" },
            { label: "How it works", slug: "start/how-it-works" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Wake for GitHub", slug: "guides/github" },
            { label: "How runs work", slug: "guides/runs" },
            { label: "Security", slug: "guides/security" },
            { label: "Troubleshooting", slug: "guides/troubleshooting" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Commands", slug: "reference/commands" },
            { label: "Files and settings", slug: "reference/files" },
            { label: "Changelog", link: "/changelog/" },
          ],
        },
        {
          label: "For apps",
          items: [
            { label: "Serve wake/v1", slug: "apps/overview" },
            { label: "The Convex component", slug: "apps/convex" },
            { label: "On Postgres or SQLite", slug: "apps/postgres" },
            { label: "Examples", slug: "apps/examples" },
            { label: "Check your app", slug: "apps/check" },
            { label: "The wake/v1 spec", slug: "spec/wake-v1" },
            { label: "Changelog for apps", link: "/apps/changelog/" },
          ],
        },
      ],
    }),
    react(),
  ],
  // Markdown tables and asides take shadcn's Table and Alert recipes.
  markdown: { processor: satteri({ hastPlugins: [shadcnMarkdown()] }) },
  vite: { plugins: [tailwindcss()] },
});
