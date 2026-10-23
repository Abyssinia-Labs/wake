import { expect, test } from "bun:test";
import type { RunState } from "./state";
import { waitingTeller, withWaiting } from "./waiting";

const run: RunState = { app: "gatherd", ref: "GAT-20", sessionId: "s-1", cwd: "/w", startedAt: 1 };

test("the state keeps the question while the run waits, and drops it after", () => {
  const waiting = withWaiting(run, { since: 5, what: "Bash command · ls" });
  expect(waiting).toEqual({ ...run, waiting: { since: 5, what: "Bash command · ls" } });
  expect(withWaiting(waiting, null)).toEqual(run);
  expect(withWaiting(waiting, null)).not.toHaveProperty("waiting");
});

test("an app that takes `true` hears `false` when the run goes on, in order", async () => {
  const said: boolean[] = [];
  const tell = waitingTeller(async (waiting) => {
    await Bun.sleep(waiting ? 5 : 0);
    said.push(waiting);
    return true;
  });
  void tell(true);
  await tell(false);
  await tell(true);
  expect(said).toEqual([true, false, true]);
});

test("an app that doesn't serve it is asked once a run, and never told `false`", async () => {
  const said: boolean[] = [];
  const tell = waitingTeller(async (waiting) => {
    said.push(waiting);
    return false;
  });
  await tell(true);
  await tell(false);
  await tell(true);
  await tell(false);
  expect(said).toEqual([true]);
});

test("`false` with no `true` before it says nothing", async () => {
  const said: boolean[] = [];
  const tell = waitingTeller(async (waiting) => {
    said.push(waiting);
    return true;
  });
  await tell(false);
  expect(said).toEqual([]);
});
