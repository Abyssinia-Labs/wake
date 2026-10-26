import { describe, expect, test } from "bun:test";
import { STEPS } from "./live-run-data";
import { fresh, type RunStep, schedule, typed } from "./live-run-print";

const step = (at: number, kind: RunStep["kind"], line: string): RunStep => ({
  at,
  clock: "2:52 PM",
  kind,
  line,
});

describe("the hero's run prints", () => {
  test("a tool call in three strokes", () => {
    const [call] = schedule([step(0, "tool", "Bash: bun test date-picker")]);
    if (!call) throw new Error("no step");
    expect(call.duration).toBe(0.15);
    expect(typed(call, 0.01)).toHaveLength(9);
    expect(typed(call, 0.06)).toHaveLength(18);
    expect(typed(call, 0.2)).toBe(call.line);
  });

  test("what was said word by word, never ending on a space", () => {
    const [said] = schedule([
      step(0, "said", "said: Three tests fail because their fixture assumes Sunday."),
    ]);
    if (!said) throw new Error("no step");
    const half = typed(said, said.duration / 2);
    expect(said.line.startsWith(half)).toBe(true);
    expect(half.endsWith(" ")).toBe(false);
    expect(half.length).toBeLessThan(said.line.length);
  });

  test("each step in time for the next, and its ghost settles", () => {
    const printed = schedule(STEPS);
    printed.forEach((one, index) => {
      const next = printed[index + 1];
      if (next) expect(one.end).toBeLessThanOrEqual(next.at);
    });
    const first = printed[0];
    if (!first) throw new Error("no step");
    expect(fresh(first, first.end)).toBe(1);
    expect(fresh(first, first.end + 0.5)).toBe(0);
  });
});
