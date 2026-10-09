// wakectl.dev: what Wake is, how to use it, and how an app serves wake/v1.
// Static, served by a Cloudflare Worker (wrangler.jsonc).
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://wakectl.dev",
  integrations: [
    starlight({
      title: "Wake",
      description:
        "Wake starts your coding agent (Claude Code, Codex, Cursor) on your Mac when someone hands it work in an app.",
      logo: { src: "./src/assets/mark.svg", alt: "Wake" },
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
