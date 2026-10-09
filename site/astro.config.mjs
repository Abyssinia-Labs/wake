// wakectl.dev: what Wake is, how to use it, and how an app serves wake/v1.
// Static, served by a Cloudflare Worker (wrangler.jsonc).
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

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
      // Risograph inks: Blue + Fluorescent Orange by day, Yellow + Pink by night (riso.css).
      customCss: ["./src/styles/riso.css"],
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
            { label: "Examples", slug: "apps/examples" },
            { label: "Check your app", slug: "apps/check" },
            { label: "The wake/v1 spec", slug: "spec/wake-v1" },
          ],
        },
      ],
    }),
  ],
});
