// How a person asks for their agent on GitHub (the owner's call,
// 2026-10-10): the label `wake` on an issue, or a line `/wake` in a comment
// or a review; `wake:codex` and `/wake codex` name the tool. GitHub won't
// let an app be an issue's assignee, so these stand in for "assign it".
import type { Tool } from "@abyssinia-labs/wake-server";

export const TOOLS: readonly Tool[] = ["claude", "codex", "cursor"];
export const TOOL_NAMES: Record<Tool, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

/** What was asked for: a tool by name, or whichever the person paired. */
export type Asked = { tool?: Tool };

/** `wake` or `wake:<tool>`, in any case; null for any other label. */
export function askedByLabel(label: string): Asked | null {
  const match = label
    .trim()
    .toLowerCase()
    .match(/^wake(?::\s*([a-z]+))?$/);
  if (!match) return null;
  return toolOf(match[1]);
}

/**
 * A line that starts with `/wake`, optionally followed by a tool, outside
 * code blocks and quoted replies (a reply that quotes a `/wake` isn't one).
 */
export function askedInText(body: string): Asked | null {
  let fenced = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || line.startsWith(">")) continue;
    const match = line.toLowerCase().match(/^\/wake(?:\s+([a-z]+))?(?:\s|$)/);
    if (match) return toolOf(match[1]);
  }
  return null;
}

function toolOf(word: string | undefined): Asked | null {
  if (word === undefined) return {};
  const tool = TOOLS.find((one) => one === word);
  // `/wake please` is still a summons; only a tool's name picks the tool.
  return tool ? { tool } : {};
}

/** Wake's agent ids for a GitHub person: one per tool they pair. */
export function agentId(userId: number, tool: Tool): string {
  return `gh-${userId}-${tool}`;
}

export function ownerId(userId: number): string {
  return `gh-${userId}`;
}
