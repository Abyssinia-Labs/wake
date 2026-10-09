// The spec's one text is docs/spec/wake-v1.md; the site shows a copy made
// at build time, so the two can't drift. Repository links become site links.
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const source = await Bun.file(join(root, "docs", "spec", "wake-v1.md")).text();
const body = source
  .replace(/^# wake\/v1\s*\n/, "")
  .replaceAll("](../../packages/convex)", "](/apps/convex/)")
  .replaceAll("](../../README.md)", "](/)");
const page = `---
title: The wake/v1 spec
description: The protocol between an app and Wake, the listener that starts a person's coding agent.
editUrl: https://github.com/Abyssinia-Labs/wake/edit/main/docs/spec/wake-v1.md
---

${body}`;
const out = join(import.meta.dir, "..", "src", "content", "docs", "spec");
await mkdir(out, { recursive: true });
await Bun.write(join(out, "wake-v1.md"), page);
