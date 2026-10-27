import { describe, expect, test } from "bun:test";
import { burrowsAcross, NIGHT, nightAt, phaseOf, STILL, statusOf, summonAt } from "./burrow-night";

describe("the burrow at night", () => {
  test("a run falls, wakes, works, rises and stays done", () => {
    expect([-1, 0.5, 1.8, 3, 5.8, 7].map(phaseOf)).toEqual([
      "asleep",
      "falling",
      "waking",
      "working",
      "rising",
      "done",
    ]);
  });

  test("every flag stands by morning, and the night starts again", () => {
    expect(nightAt(0, 6).planted).toBe(0);
    const morning = nightAt(16, 6);
    expect(morning.planted).toBe(6);
    expect(morning.dawn).toBe(1);
    expect(nightAt(NIGHT + 0.1, 6).planted).toBe(0);
  });

  test("the still picture holds mid-night: three flags up, two at work", () => {
    const night = nightAt(STILL, 6);
    expect(night.planted).toBe(3);
    expect(night.runs.filter((run) => run.phase === "working")).toHaveLength(2);
  });

  test("a click sends a summons to the nearest burrow asleep", () => {
    const xs = burrowsAcross(1440);
    const sent = summonAt(0.2, xs[2] ?? 0, xs, []);
    expect(sent).toEqual({ index: 2, loop: 0, at: 0.2 });
    if (!sent) throw new Error("no summons");
    expect(nightAt(1, xs.length, [sent]).runs[2]?.phase).toBe("falling");
    expect(summonAt(16, 0, xs, [])).toBeNull();
  });

  test("its steps type out under it, then what came back", () => {
    const run = nightAt(0.6 + 2.1 + 0.25, 6).runs[0];
    if (!run) throw new Error("no run");
    expect(run.steps[0].startsWith(statusOf(run))).toBe(true);
    expect(statusOf({ ...run, r: 7, phase: "done" })).toBe("opened #215");
  });

  test("as many burrows as fit, never fewer than three", () => {
    expect(burrowsAcross(390)).toHaveLength(3);
    expect(burrowsAcross(1440)).toHaveLength(5);
    expect(burrowsAcross(2560)).toHaveLength(6);
  });
});
