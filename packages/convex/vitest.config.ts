import { defineConfig } from "vitest/config";

// convex-test runs functions in the edge runtime, as Convex does.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["src/**/*.test.ts"],
  },
});
