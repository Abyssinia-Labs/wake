import { expect, test } from "bun:test";
import type { Exec, Result } from "./exec";
import { MAX_WHAT, questionOf, type Waiting, watchWaiting } from "./herdr-waiting";

const RULE = "─".repeat(60);
const DASHES = "╌".repeat(60);

// Claude Code 2.1.307 asking about a command, as `herdr agent read --source
// visible` showed it on 2026-10-23 (herdr 0.9.3), with the blank rows left out.
const BASH = [
  "❯ Use the Bash tool to run exactly this command: mkdir -p probe && date > probe/now.txt",
  "⏺ Creating probe directory and writing current date",
  "  ⎿  $ mkdir -p probe && date > probe/now.txt",
  RULE,
  " Bash command",
  ' Tip: auto mode handles these prompts for you — choose "switch to auto mode" below',
  " Create probe directory and write current date",
  DASHES,
  " mkdir -p probe && date > probe/now.txt",
  DASHES,
  " Do you want to proceed?",
  " ❯ 1. Yes",
  "   2. Yes, and don't ask again for mkdir -p probe and date commands in",
  "      /Users/m/probe",
  "   3. Yes, and switch to auto mode · auto mode handles these prompts for you",
  "   4. No",
  "",
  " Esc to cancel · Tab to amend",
].join("\n");

// The same Claude Code asking to trust a new folder before it starts.
const TRUST = [
  "% claude --setting-sources user --settings /Users/m/.wake/runs/s.settings.json",
  "",
  RULE,
  " Accessing workspace:",
  "",
  " /Users/m/Projects/widgets/.claude/worktrees/gat-20",
  "",
  " Quick safety check: Is this a project you created or one you trust?",
  "",
  " Security guide",
  "",
  " ❯ No, exit",
  "   Yes, I trust this folder",
  "",
  " Enter to confirm · Esc to cancel",
].join("\n");

test("the question is what follows the last rule, up to its options", () => {
  expect(questionOf(BASH)).toBe(
    "Bash command · Create probe directory and write current date · mkdir -p probe && date > probe/now.txt · Do you want to proceed?",
  );
  expect(questionOf(TRUST)).toBe(
    "Accessing workspace: · /Users/m/Projects/widgets/.claude/worktrees/gat-20 · Quick safety check: Is this a project you created or one you trust? · Security guide",
  );
});

test("one line, without control characters, cut to a reason's length", () => {
  expect(questionOf(`${RULE}\n Run \u001b[31mthis\u0007?\n 1. Yes`)).toBe("Run [31mthis ?");
  const long = questionOf(`${RULE}\n ${"x".repeat(500)}\n 1. Yes`);
  expect(long).toHaveLength(MAX_WHAT);
  expect(long.endsWith("…")).toBe(true);
  expect(questionOf("")).toBe("");
});

const ok = (stdout = "{}"): Result => ({ code: 0, stdout, stderr: "" });
const timedOut: Result = {
  code: 1,
  stdout: "",
  stderr: '{"error":{"code":"timeout","message":"timed out waiting for agent status"}}',
};

/** herdr answering each call with the next of `answers`, then never again. */
function herdr(answers: Result[]) {
  const calls: string[][] = [];
  const run: Exec = (cmd) => {
    calls.push(cmd);
    const next = answers.shift();
    return next ? Promise.resolve(next) : new Promise(() => {});
  };
  return { run, calls };
}

const deps = (pauses: number[] = []) => ({
  now: () => 42,
  pause: async (ms: number) => void pauses.push(ms),
  chunkMs: 1_000,
});

test("blocked: the question is read and heard; going on clears it", async () => {
  const { run, calls } = herdr([timedOut, ok(), ok(BASH), timedOut, ok()]);
  const heard: (Waiting | null)[] = [];
  const stop = watchWaiting(run, "wake-gat-20-abc", (w) => heard.push(w), deps());
  await Bun.sleep(5);
  expect(heard).toEqual([
    {
      since: 42,
      what: "Bash command · Create probe directory and write current date · mkdir -p probe && date > probe/now.txt · Do you want to proceed?",
    },
    null,
  ]);
  expect(calls.slice(0, 3)).toEqual([
    ["herdr", "agent", "wait", "wake-gat-20-abc", "--until", "blocked", "--timeout", "1000"],
    ["herdr", "agent", "wait", "wake-gat-20-abc", "--until", "blocked", "--timeout", "1000"],
    ["herdr", "agent", "read", "wake-gat-20-abc", "--source", "visible"],
  ]);
  expect(calls[4]).toEqual([
    "herdr",
    "agent",
    "wait",
    "wake-gat-20-abc",
    "--until",
    "working",
    "--until",
    "idle",
    "--until",
    "done",
    "--timeout",
    "1000",
  ]);
  expect(stop()).toBe(false);
});

test("ending the watch while it waits says so, and nothing is heard after", async () => {
  const { run } = herdr([ok(), ok(TRUST)]);
  const heard: (Waiting | null)[] = [];
  const stop = watchWaiting(run, "wake-a", (w) => heard.push(w), deps());
  await Bun.sleep(5);
  expect(heard).toHaveLength(1);
  expect(stop()).toBe(true);
  expect(heard).toHaveLength(1);
});

test("herdr failing outright is asked again after a pause; an unreadable screen is an empty question", async () => {
  const pauses: number[] = [];
  const { run } = herdr([
    { code: 1, stdout: "", stderr: "connection refused" },
    ok(),
    { code: 1, stdout: "", stderr: '{"error":{"code":"agent_not_found"}}' },
  ]);
  const heard: (Waiting | null)[] = [];
  watchWaiting(run, "wake-a", (w) => heard.push(w), deps(pauses));
  await Bun.sleep(5);
  expect(pauses).toEqual([5_000]);
  expect(heard).toEqual([{ since: 42, what: "" }]);
});
