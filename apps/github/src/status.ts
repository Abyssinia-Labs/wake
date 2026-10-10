// The one comment a run writes into on GitHub, edited as it goes (WAK-4):
// on it, by the run's two-word name; then done, or why not. The machine
// and the session stay off a public page: its owner gets back in with
// `wake open <name>` on their own machine.
import type { SummonsRow } from "@abyssinia-labs/wake-server";
import { TOOL_NAMES } from "./commands";

export function statusText(row: SummonsRow, asker: string): string | null {
  const run = row.run;
  if (!run) return null;
  const tool = TOOL_NAMES[run.tool];
  const name = `\`${run.name}\``;
  const marker = `<!-- wake:${row.id} -->`;
  const back = `@${asker}: \`wake open ${run.name}\` gets you back into it.`;
  if (row.state === "claimed") {
    return `${marker}\n⏰ **${tool}** is on it as ${name}, on @${asker}'s machine.\n\n<sub>${back}</sub>`;
  }
  if (row.state === "done") {
    return `${marker}\n✅ **${tool}** finished ${name}.\n\n<sub>${back}</sub>`;
  }
  if (row.state === "failed") {
    const why = row.reason ? `: ${row.reason}` : ".";
    return `${marker}\n⚠️ **${tool}** couldn't finish ${name}${why}\n\n<sub>${back}</sub>`;
  }
  return null;
}
