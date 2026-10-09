// Which summons to claim next, across every paired app: oldest first, at
// most `maxRuns` at once, none while paused. Each claim races every other
// place of the same agent (the pattern's third principle); a lost race is
// not an error, it is someone else's run.
import type { Claim, Outcome, Run, RunReport, Summons } from "./contract";
import { reasonFor } from "./errors";
import { messageOf } from "./log";

export type Place = {
  domain: string;
  claim(id: string): Promise<Claim>;
  finish(outcome: Outcome): Promise<void>;
  /** `wake:started`; false when the app doesn't serve it, so the agent says it instead. */
  started(id: string, run: RunReport): Promise<boolean>;
};

export type Work = (place: Place, summons: Summons, run: Run) => Promise<Outcome>;

export type SchedulerOptions = {
  maxRuns: number;
  isPaused: () => boolean;
  work: Work;
  note: (line: string) => void;
  now?: () => number;
  /** How long a claim that failed to reach the app waits before another try. */
  retryMs?: number;
  /** Waits between tries to report an outcome. */
  finishBackoffMs?: number[];
};

const keyOf = (domain: string, id: string): string => `${domain}\u0000${id}`;

export class Scheduler {
  private readonly lists = new Map<string, { place: Place; summonses: Summons[] }>();
  private readonly busy = new Set<string>();
  /** Lost or finished here: never claimed again until the app stops listing it. */
  private readonly passed = new Set<string>();
  private readonly retryAt = new Map<string, number>();
  private running = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly o: SchedulerOptions) {}

  get active(): number {
    return this.running;
  }

  /** The app's latest list for one place, from its subscription. */
  offer(place: Place, summonses: Summons[]): void {
    const listed = new Set(summonses.map((s) => keyOf(place.domain, s.id)));
    const prefix = keyOf(place.domain, "");
    for (const key of [...this.passed, ...this.retryAt.keys()]) {
      if (key.startsWith(prefix) && !listed.has(key)) {
        this.passed.delete(key);
        this.retryAt.delete(key);
      }
    }
    this.lists.set(place.domain, { place, summonses });
    this.pump();
  }

  drop(domain: string): void {
    this.lists.delete(domain);
  }

  /** Look again: after a resume, or on the listener's tick. */
  poke(): void {
    this.pump();
  }

  private pump(): void {
    if (this.o.isPaused()) return;
    const now = this.o.now?.() ?? Date.now();
    const queue = [...this.lists.values()]
      .flatMap(({ place, summonses }) => summonses.map((summons) => ({ place, summons })))
      .sort((a, b) => a.summons.at - b.summons.at);
    for (const { place, summons } of queue) {
      if (this.running >= this.o.maxRuns) return;
      const key = keyOf(place.domain, summons.id);
      if (this.busy.has(key) || this.passed.has(key)) continue;
      if ((this.retryAt.get(key) ?? 0) > now) continue;
      this.busy.add(key);
      this.running += 1;
      void this.take(place, summons, key);
    }
  }

  private async take(place: Place, summons: Summons, key: string): Promise<void> {
    try {
      let claim: Claim;
      try {
        claim = await place.claim(summons.id);
      } catch (error) {
        this.later(key);
        this.o.note(
          `Could not claim ${summons.target.ref} on ${place.domain}: ${messageOf(error)}`,
        );
        return;
      }
      if (!claim.claimed) {
        this.passed.add(key);
        return;
      }
      this.retryAt.delete(key);
      this.o.note(`Claimed ${summons.target.ref} on ${place.domain} (${summons.kind}).`);
      const outcome = await this.o.work(place, summons, claim.run).catch((error): Outcome => {
        // The detail stays here; the app is told only what is safe to show.
        this.o.note(`${summons.target.ref} failed: ${messageOf(error)}`);
        return { id: summons.id, outcome: "failed", reason: reasonFor(error) };
      });
      this.passed.add(key);
      await this.finish(place, outcome, summons.target.ref);
    } finally {
      this.running -= 1;
      this.busy.delete(key);
      this.pump();
    }
  }

  private later(key: string): void {
    const wait = this.o.retryMs ?? 60_000;
    this.retryAt.set(key, (this.o.now?.() ?? Date.now()) + wait);
    if (this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.pump();
    }, wait);
    this.retryTimer.unref?.();
  }

  private async finish(place: Place, outcome: Outcome, ref: string): Promise<void> {
    const waits = this.o.finishBackoffMs ?? [2_000, 10_000, 60_000];
    for (let attempt = 0; ; attempt += 1) {
      try {
        await place.finish(outcome);
        this.o.note(
          `Finished ${ref} on ${place.domain}: ${outcome.outcome}${outcome.reason ? ` (${outcome.reason})` : ""}.`,
        );
        return;
      } catch (error) {
        const wait = waits[attempt];
        if (wait === undefined) {
          this.o.note(`Could not report ${ref} on ${place.domain}: ${messageOf(error)}`);
          return;
        }
        await Bun.sleep(wait);
      }
    }
  }
}
