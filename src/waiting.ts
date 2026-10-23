// A run waiting on its owner (herdr-waiting.ts finds it): kept on the run in
// the listener's state for `wakectl status`, with what it asks, and told to
// the app with `wake:waiting`, which says only that it waits.
import type { Waiting } from "./herdr-waiting";
import type { RunState } from "./state";

/** The run as the state file keeps it, waiting or not. */
export function withWaiting(run: RunState, waiting: Waiting | null): RunState {
  const { waiting: _before, ...rest } = run;
  return waiting ? { ...rest, waiting } : rest;
}

/**
 * For one run: tells its app it waits and that it goes on, in order. The call
 * is optional in wake/v1, so it is made as `wake:started` is and the app's
 * answer says whether it serves it: once the app hasn't taken a `true`, the
 * run says no more, and `false` goes only where `true` was heard.
 */
export function waitingTeller(
  say: (waiting: boolean) => Promise<boolean>,
): (waiting: boolean) => Promise<void> {
  let heard: boolean | undefined;
  let last = Promise.resolve();
  return (waiting) => {
    last = last
      .then(async () => {
        if (waiting) {
          if (heard !== false) heard = await say(true);
        } else if (heard) {
          await say(false);
        }
      })
      .catch(() => undefined);
    return last;
  };
}
