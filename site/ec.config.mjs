// Expressive Code's options live here, not in astro.config.mjs, because the
// `<Code>` component needs them serialisable and a plugin is a function.
import { defineEcConfig } from "@astrojs/starlight/expressive-code";
import { wakeCopyButton } from "./src/ec/copy-button.mjs";

export default defineEcConfig({
  // The copy button is ours: a shadcn Button (src/ec/copy-button.mjs).
  frames: { showCopyToClipboardButton: false },
  plugins: [wakeCopyButton()],
});
