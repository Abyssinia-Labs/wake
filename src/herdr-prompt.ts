// Handing an agent its prompt in herdr, and waiting for the turn to end.
//
// herdr gives up on a prompt that sees no working or blocked state within
// five seconds (agent_prompt_stalled). Straight after a question before
// startup is answered (Claude Code's "trust this folder?"), the agent is
// still getting ready and the paste is lost: the tab sat idle with an empty
// box and the run failed (Antescript, 2026-10-09). So after such an answer
// Wake lets it settle first, and a stalled prompt, which reached nobody, is
// sent again, at most twice.
import type { ClaudeResult } from "./claude";
import type { Exec } from "./exec";
import { type Waiting, watchWaiting } from "./herdr-waiting";
import { STOPPED } from "./stop";

export const SETTLE_MS = 2_500;
export const STALL_RETRIES = 2;

export type PromptRun = {
  name: string;
  text: string;
  timeoutMs: number;
  /** A question before startup was just answered: let the agent settle first. */
  settle: boolean;
  onEvent?: (line: string) => void;
  /** Aborted when its owner stops the run: the agent's turn is interrupted, its tab kept. */
  signal?: AbortSignal;
  /** Hears when the turn stops on a question for its owner, and when it goes on. */
  onWaiting?: (waiting: Waiting | null) => void;
};

/** Resolves when the signal aborts; never, without one. */
function whenAborted(signal: AbortSignal | undefined): Promise<"stopped"> {
  return new Promise((resolve) => {
    if (signal?.aborted) resolve("stopped");
    else signal?.addEventListener("abort", () => resolve("stopped"), { once: true });
  });
}

function lastLine(result: { stdout: string; stderr: string }): string {
  return (result.stderr || result.stdout).trim().split("\n").at(-1) ?? "";
}

export async function promptUntilTurnEnds(
  run: Exec,
  o: PromptRun,
  pause: (ms: number) => Promise<unknown> = Bun.sleep,
): Promise<ClaudeResult> {
  if (o.settle) await pause(SETTLE_MS);
  // The wait below is on the turn's end; a question meanwhile is watched beside it.
  const onWaiting = o.onWaiting;
  const unwatch = onWaiting
    ? watchWaiting(run, o.name, (waiting) => {
        o.onEvent?.(
          waiting
            ? `waiting for you in herdr${waiting.what ? `: ${waiting.what}` : ""}`
            : "no longer waiting for you",
        );
        onWaiting(waiting);
      })
    : undefined;
  try {
    return await untilTurnEnds(run, o, pause);
  } finally {
    // A turn that ended on its question (stopped, or out of time) waits on nobody now.
    if (unwatch?.()) onWaiting?.(null);
  }
}

async function untilTurnEnds(
  run: Exec,
  o: PromptRun,
  pause: (ms: number) => Promise<unknown>,
): Promise<ClaudeResult> {
  const stopped = whenAborted(o.signal);
  for (let attempt = 0; ; attempt++) {
    const waiting = run([
      "herdr",
      "agent",
      "prompt",
      o.name,
      o.text,
      "--wait",
      // Done or idle: either is the turn ended. herdr calls a finished turn
      // done only until someone has seen it, so one the person watched to the
      // end is idle (GAT-31), and so is one they stopped (GAT-20). Waiting on
      // done alone held a stopped run for its whole timeout.
      "--until",
      "done",
      "--until",
      "idle",
      "--timeout",
      String(o.timeoutMs),
    ]);
    const answer = await Promise.race([waiting, stopped]);
    if (answer === "stopped") {
      // Esc interrupts the agent's turn in its own terminal; the session and
      // its tab stay, as at the end of any turn, for the person to read or go on.
      await run(["herdr", "agent", "send-keys", o.name, "esc"]);
      o.onEvent?.("stopped by its owner: interrupted in herdr, and its tab stays open");
      return { ok: false, reason: STOPPED };
    }
    if (answer.code === 0) {
      // Finished and stopped look alike from here, so neither is called a
      // failure: the person was watching, and the agent's comment says which.
      o.onEvent?.("its turn ended in herdr; the session stays open in its tab");
      return { ok: true };
    }
    const why = lastLine(answer);
    if (why.includes("agent_prompt_stalled") && attempt < STALL_RETRIES) {
      o.onEvent?.("the prompt didn't reach the agent; sending it again");
      await pause(SETTLE_MS);
      continue;
    }
    return {
      ok: false,
      reason: why.includes("agent_prompt_stalled")
        ? "The agent in herdr never took the prompt; its tab is still open."
        : why.includes("timeout")
          ? `Stopped waiting after ${Math.round(o.timeoutMs / 60_000)} minutes; it is still open in herdr.`
          : `herdr: ${why || "the agent's tab closed before it was done."}`,
    };
  }
}
