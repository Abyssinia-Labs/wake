import { expect, test } from "bun:test";
import { limitsLines, nextLimits } from "./commands/limits";
import { defaults } from "./config";

process.env.NO_COLOR = "1";

test("runs at once is 1 or 2, the pattern's ceiling", () => {
  expect(nextLimits(defaults(), "runs", "1").maxRuns).toBe(1);
  expect(() => nextLimits(defaults(), "runs", "3")).toThrow("from 1 to 2");
  expect(() => nextLimits(defaults(), "runs", "1.5")).toThrow("whole number");
});

test("a run is stopped after whole minutes, up to a day", () => {
  expect(nextLimits(defaults(), "stop-after", "90").runTimeoutMinutes).toBe(90);
  expect(() => nextLimits(defaults(), "stop-after", "0")).toThrow("from 1 to 1440");
  expect(() => nextLimits(defaults(), "stop-after", "1441")).toThrow("from 1 to 1440");
  expect(() => nextLimits(defaults(), "timeout", "5")).toThrow("usage");
});

test("with nothing to change, it says both", () => {
  expect(limitsLines({ maxRuns: 2, runTimeoutMinutes: 120 })[0]).toBe(
    "At most 2 runs at once; a run is stopped after 120 min",
  );
});
