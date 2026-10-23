// A run's tab in herdr, found again by the label Wake gave it (herdr.ts),
// for `wakectl open` on a run still going there: its session is live in the
// tab, and a second process on it would fight the first.
import type { Exec } from "./exec";
import { findString, tabLabel } from "./herdr";
import { runTitle } from "./run-name";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The label of a run's tab: its ticket and name, as `runInHerdr` made it. */
export function runTabLabel(ref: string, name: string): string {
  return tabLabel(runTitle(ref, name));
}

/** The id of the tab with that label in `herdr tab list`'s answer, however nested. */
export function findTab(listed: unknown, label: string): string | undefined {
  if (Array.isArray(listed)) {
    for (const item of listed) {
      const found = findTab(item, label);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(listed)) return undefined;
  // herdr 0.9.3: `{ result: { tabs: [{ tab_id, label, workspace_id, … }] } }`.
  if (typeof listed.tab_id === "string" && listed.label === label) return listed.tab_id;
  for (const inner of Object.values(listed)) {
    const found = findTab(inner, label);
    if (found) return found;
  }
  return undefined;
}

/** herdr's reason: the message of the JSON error it prints, else its last line. */
function reasonOf(result: { stdout: string; stderr: string }): string {
  const text = (result.stderr || result.stdout).trim();
  try {
    const message = findString(JSON.parse(text), ["message"]);
    if (message) return message;
  } catch {}
  return text.split("\n").at(-1) ?? "";
}

/**
 * Brings the tab with that label to the front, in whichever workspace holds
 * it (`herdr tab focus` switches workspace too). Its id, or undefined when no
 * tab has the label: closed, or renamed by the person.
 */
export async function focusTab(run: Exec, label: string): Promise<string | undefined> {
  const listed = await run(["herdr", "tab", "list"]);
  if (listed.code !== 0) throw new Error(`herdr didn't list its tabs: ${reasonOf(listed)}`);
  let tabs: unknown;
  try {
    tabs = JSON.parse(listed.stdout);
  } catch {
    throw new Error("herdr listed its tabs in a form Wake doesn't read.");
  }
  const tab = findTab(tabs, label);
  if (!tab) return undefined;
  const focused = await run(["herdr", "tab", "focus", tab]);
  if (focused.code !== 0) throw new Error(`herdr didn't focus the tab: ${reasonOf(focused)}`);
  return tab;
}
