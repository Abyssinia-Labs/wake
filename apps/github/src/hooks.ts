// wake-server's run hooks, written onto GitHub: the first word of a run
// makes its status comment, and every later one edits that comment, so an
// issue gains one comment per run, not one per step.
import type { SummonsRow, WakeHooks } from "@abyssinia-labs/wake-server";
import type { Asks } from "./db";
import type { GitHub } from "./github";
import { statusText } from "./status";

export function githubHooks(asks: Asks, github: GitHub): WakeHooks {
  const write = async (row: SummonsRow): Promise<void> => {
    const ask = await asks.get(row.id);
    if (!ask) return;
    const body = statusText(row, ask.asker);
    if (!body) return;
    if (ask.statusComment !== null) {
      await github.editComment(ask.installation, ask.repo, ask.statusComment, body);
      return;
    }
    const id = await github.comment(ask.installation, ask.repo, ask.number, body);
    await asks.setStatusComment(row.id, id);
  };
  return { started: write, finished: write };
}
