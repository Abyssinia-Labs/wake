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

export const SETTLE_MS = 2_500;
export const STALL_RETRIES = 2;

export type PromptRun = {
  name: string;
  text: string;
  timeoutMs: number;
  /** A question before startup was just answered: let the agent settle first. */
  settle: boolean;
  onEvent?: (line: string) => void;
};

function lastLine(result: { stdout: string; stderr: string }): string {
  return (result.stderr || result.stdout).trim().split("\n").at(-1) ?? "";
}

export async function promptUntilTurnEnds(
  run: Exec,
  o: PromptRun,
  pause: (ms: number) => Promise<unknown> = Bun.sleep,
): Promise<ClaudeResult> {
  if (o.settle) await pause(SETTLE_MS);
  for (let attempt = 0; ; attempt++) {
    const answer = await run([
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
