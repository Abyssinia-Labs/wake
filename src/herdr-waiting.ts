// Whether a run in herdr waits on its owner. herdr calls an agent `blocked`
// when it recognises an approval or a question on its screen (a tool asking
// permission, a folder to trust), and `agent wait --until blocked` returns
// as soon as it is (herdr 0.9.3, tried on a Claude Code tab, 2026-10-23).
// herdr says nothing more of the question: no field of `agent get`, `api
// snapshot` or `agent explain` carries it. So what it asks is read from the
// tab as herdr shows it, and stays on this machine; the app hears only that
// the run waits (`wake:waiting`).
//
// A headless run never waits: `claude -p`, `codex exec` and `cursor-agent
// -p` have nobody to ask, so what isn't allowed is denied, not asked.
import type { Exec } from "./exec";

export type Waiting = {
  since: number;
  /** The question as the tab shows it; empty when the screen couldn't be read. */
  what: string;
};

/** How long each `agent wait` lasts before it is asked again, so a watch can end. */
export const WATCH_CHUNK_MS = 30_000;
/** After herdr fails outright (its server gone, say), before it is asked again. */
export const WATCH_RETRY_MS = 5_000;
/** At most this much of the question is kept, as for a finish's reason. */
export const MAX_WHAT = 300;

/** Claude Code's full-width rule; its dashed ╌ separators sit inside a question. */
const RULE = /^\s*─{3,}\s*$/;
const SEPARATOR = /^[\s─╌━═┄┈-]*$/;
/** Where the question ends: its options (`❯ 1. Yes`, `2. No`, `❯ No, exit`) or footer. */
const END = /^\s*(?:[❯›]\s*)?\d+\.\s|^\s*[❯›]\s|esc to cancel/i;
const TIP = /^\s*tip:/i;

/**
 * The question on an agent's screen: the lines after the last rule, where
 * herdr's own blocked-form rule looks, up to its options. One line, with no
 * control characters, at most MAX_WHAT long.
 */
export function questionOf(screen: string): string {
  const lines = screen.split("\n");
  const rule = lines.findLastIndex((line) => RULE.test(line));
  const from = rule >= 0 ? rule + 1 : Math.max(0, lines.length - 20);
  const kept: string[] = [];
  for (const line of lines.slice(from)) {
    if (END.test(line)) break;
    if (SEPARATOR.test(line) || TIP.test(line)) continue;
    kept.push(
      line
        .replace(/[\p{Cc}\p{Cf}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim(),
    );
  }
  const what = kept.filter(Boolean).join(" · ");
  return what.length > MAX_WHAT ? `${what.slice(0, MAX_WHAT - 1)}…` : what;
}

/** What the agent's tab asks, read as herdr shows it; empty when herdr can't say. */
export async function readQuestion(run: Exec, name: string): Promise<string> {
  const result = await run(["herdr", "agent", "read", name, "--source", "visible"]);
  return result.code === 0 ? questionOf(result.stdout) : "";
}

export type WatchDeps = {
  now: () => number;
  pause: (ms: number) => Promise<unknown>;
  chunkMs: number;
};

const realDeps: WatchDeps = { now: Date.now, pause: Bun.sleep, chunkMs: WATCH_CHUNK_MS };

/**
 * Watches one agent until the returned function is called: `onChange` hears
 * a Waiting when it stops on a question and null when it goes on. Ending the
 * watch says whether it was still waiting, for the caller to clear.
 */
export function watchWaiting(
  run: Exec,
  name: string,
  onChange: (waiting: Waiting | null) => void,
  deps: WatchDeps = realDeps,
): () => boolean {
  let stopped = false;
  let waiting = false;
  const until = async (states: string[]): Promise<"reached" | "timeout" | "failed"> => {
    const result = await run([
      "herdr",
      "agent",
      "wait",
      name,
      ...states.flatMap((state) => ["--until", state]),
      "--timeout",
      String(deps.chunkMs),
    ]);
    if (result.code === 0) return "reached";
    return `${result.stderr}${result.stdout}`.includes('"timeout"') ? "timeout" : "failed";
  };
  const watch = async (): Promise<void> => {
    while (!stopped) {
      // `unknown` clears nothing: herdr can't tell, and the question may still be up.
      const reached = await until(waiting ? ["working", "idle", "done"] : ["blocked"]);
      if (stopped) return;
      if (reached === "failed") await deps.pause(WATCH_RETRY_MS);
      if (reached !== "reached") continue;
      if (waiting) {
        waiting = false;
        onChange(null);
        continue;
      }
      const since = deps.now();
      const what = await readQuestion(run, name);
      if (stopped) return;
      waiting = true;
      onChange({ since, what });
    }
  };
  void watch().catch(() => undefined);
  return () => {
    stopped = true;
    return waiting;
  };
}
