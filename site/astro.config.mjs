// wakectl.dev: what Wake is, how to use it, and how an app serves wake/v1.
// Static, served by a Cloudflare Worker (wrangler.jsonc). The chrome is
// shadcn/ui on Tailwind (React, rendered to HTML at build; the one island
// is the server-half tabs on the landing page), in the inks of riso.css.

import { satteri } from "@astrojs/markdown-satteri";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { shadcnMarkdown } from "./src/markdown/shadcn.ts";

export default defineConfig({
  site: "https://wakectl.dev",
  integrations: [
    starlight({
      title: "wakectl",
      description:
        "Wake starts your coding agent (Claude Code, Codex, Cursor) on your Mac when someone hands it work in an app.",
      logo: {
        light: "./src/assets/mark-light.svg",
        dark: "./src/assets/mark-dark.svg",
        alt: "",
      },
      // Tailwind first (it declares the cascade layers), then the risograph
      // inks, then Starlight's chrome and content restyled to shadcn's measures.
      customCss: [
        "./src/styles/global.css",
        "./src/styles/riso.css",
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
      },
      head: [
        { tag: "link", attrs: { rel: "preconnect", href: "https://fonts.googleapis.com" } },
        {
          tag: "link",
          attrs: { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: true },
        },
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: "https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Work+Sans:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap",
          },
        },
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
