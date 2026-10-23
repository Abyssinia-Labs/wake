import { expect, test } from "bun:test";
import type { Exec } from "./exec";
import { promptUntilTurnEnds, SETTLE_MS } from "./herdr-prompt";

const STALLED = JSON.stringify({
  error: {
    code: "agent_prompt_stalled",
    message: "no observed working or blocked state within 5000 ms",
  },
});

/** herdr answering each `agent prompt` with the next of `answers`. */
function herdr(answers: { code: number; stdout: string }[]) {
  const prompts: string[][] = [];
  const run: Exec = async (cmd) => {
    prompts.push(cmd);
    return { ...(answers.shift() ?? { code: 0, stdout: "{}" }), stderr: "" };
  };
  return { run, prompts };
}

const base = { name: "wake-gat-1-abc", text: "Do the thing.", timeoutMs: 60_000 };

test("a prompt that reached nobody is sent again, and the turn then ends", async () => {
  const { run, prompts } = herdr([
    { code: 1, stdout: STALLED },
    { code: 0, stdout: "{}" },
  ]);
  const said: string[] = [];
  const pauses: number[] = [];
  const result = await promptUntilTurnEnds(
    run,
    { ...base, settle: false, onEvent: (line) => said.push(line) },
    async (ms) => void pauses.push(ms),
  );
  expect(result).toEqual({ ok: true });
  expect(prompts).toHaveLength(2);
  expect(said[0]).toContain("sending it again");
  expect(pauses).toEqual([SETTLE_MS]);
});

test("after two retries it gives up and says the tab is still open", async () => {
  const { run, prompts } = herdr([
    { code: 1, stdout: STALLED },
    { code: 1, stdout: STALLED },
    { code: 1, stdout: STALLED },
  ]);
  const result = await promptUntilTurnEnds(run, { ...base, settle: false }, async () => {});
  expect(prompts).toHaveLength(3);
  expect(result).toEqual({
    ok: false,
    reason: "The agent in herdr never took the prompt; its tab is still open.",
  });
});

test("after a question before startup it waits before the first prompt; other errors aren't retried", async () => {
  const pauses: number[] = [];
  const { run, prompts } = herdr([{ code: 1, stdout: '{"error":{"code":"agent_not_found"}}' }]);
  const result = await promptUntilTurnEnds(
    run,
    { ...base, settle: true },
    async (ms) => void pauses.push(ms),
  );
  expect(pauses).toEqual([SETTLE_MS]);
  expect(prompts).toHaveLength(1);
  expect(result.ok).toBe(false);
  expect(result.reason).toContain("agent_not_found");
});

/** herdr whose turn ends when `end` is called, its agent blocking once meanwhile. */
function blocking(waits: { code: number; stdout: string; stderr: string }[]) {
  let end: () => void = () => {};
  const turn = new Promise<void>((resolve) => {
    end = resolve;
  });
  const run: Exec = async (cmd) => {
    if (cmd[2] === "prompt") return await turn.then(() => ({ code: 0, stdout: "{}", stderr: "" }));
    if (cmd[2] === "read")
      return { code: 0, stdout: `${"─".repeat(9)}\n Run git push?\n 1. Yes`, stderr: "" };
    if (cmd[2] === "wait") return waits.shift() ?? (await new Promise(() => {}));
    return { code: 0, stdout: "{}", stderr: "" };
  };
  return { run, end: () => end() };
}

const reached = { code: 0, stdout: "{}", stderr: "" };

test("a question during the turn is logged and heard, and its answer too", async () => {
  const { run, end } = blocking([reached, reached]);
  const said: string[] = [];
  const heard: unknown[] = [];
  const turn = promptUntilTurnEnds(run, {
    ...base,
    settle: false,
    onEvent: (line) => said.push(line),
    onWaiting: (w) => heard.push(w),
  });
  await Bun.sleep(5);
  end();
  expect(await turn).toEqual({ ok: true });
  expect(heard).toEqual([{ since: expect.any(Number), what: "Run git push?" }, null]);
  expect(said.slice(0, 2)).toEqual([
    "waiting for you in herdr: Run git push?",
    "no longer waiting for you",
  ]);
});

test("a turn that ends on its question clears it without saying it went on", async () => {
  const { run, end } = blocking([reached]);
  const said: string[] = [];
  const heard: unknown[] = [];
  const turn = promptUntilTurnEnds(run, {
    ...base,
    settle: false,
    onEvent: (line) => said.push(line),
    onWaiting: (w) => heard.push(w),
  });
  await Bun.sleep(5);
  end();
  await turn;
  expect(heard).toEqual([{ since: expect.any(Number), what: "Run git push?" }, null]);
  expect(said).not.toContain("no longer waiting for you");
});
