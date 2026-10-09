import { describe, expect, test } from "bun:test";
import type { Claim, Outcome, Summons } from "./contract";
import { PRIVATE_FAILURE, Shareable } from "./errors";
import { type Place, Scheduler, type SchedulerOptions } from "./scheduler";

const s = (id: string, at: number): Summons => ({
  id,
  app: "gatherd",
  kind: "assigned",
  target: { kind: "ticket", ref: id.toUpperCase(), url: `https://gatherd.dev/t/${id}` },
  at,
});

type FakePlace = Place & { claims: string[]; finished: Outcome[] };

function fakePlace(domain: string, answer: (id: string) => Claim | Error): FakePlace {
  const place: FakePlace = {
    domain,
    claims: [],
    finished: [],
    claim: async (id) => {
      place.claims.push(id);
      const a = answer(id);
      if (a instanceof Error) throw a;
      return a;
    },
    finish: async (o) => {
      place.finished.push(o);
    },
    started: async () => false,
  };
  return place;
}

const won: Claim = { claimed: true, run: { prompt: "go" } };
const settle = () => Bun.sleep(5);

function scheduler(o: Partial<SchedulerOptions> & Pick<SchedulerOptions, "work">): Scheduler {
  return new Scheduler({ maxRuns: 2, isPaused: () => false, note: () => {}, ...o });
}

describe("Scheduler", () => {
  test("claims oldest first across apps, at most maxRuns at once", async () => {
    const order: string[] = [];
    const gates: Array<() => void> = [];
    let peak = 0;
    const sch = scheduler({
      maxRuns: 1,
      work: (_p, summons) => {
        order.push(summons.id);
        peak = Math.max(peak, sch.active);
        return new Promise((resolve) =>
          gates.push(() => resolve({ id: summons.id, outcome: "done" })),
        );
      },
    });
    const a = fakePlace("gatherd.dev", () => won);
    const b = fakePlace("antescript.dev", () => won);
    sch.offer(a, [s("a3", 3), s("a1", 1)]);
    sch.offer(b, [s("b2", 2)]);
    await settle();
    expect(order).toEqual(["a1"]);
    gates.shift()?.();
    await settle();
    gates.shift()?.();
    await settle();
    expect(order).toEqual(["a1", "b2", "a3"]);
    expect(peak).toBe(1);
  });

  test("a lost race is not claimed again until the app stops listing it", async () => {
    const place = fakePlace("gatherd.dev", () => ({ claimed: false }));
    const sch = scheduler({ work: async () => ({ id: "x", outcome: "done" }) });
    sch.offer(place, [s("x", 1)]);
    await settle();
    sch.poke();
    sch.offer(place, [s("x", 1)]);
    await settle();
    expect(place.claims).toEqual(["x"]);
    sch.offer(place, []);
    sch.offer(place, [s("x", 1)]);
    await settle();
    expect(place.claims).toEqual(["x", "x"]);
  });

  test("a run that throws is reported as failed, once", async () => {
    const place = fakePlace("gatherd.dev", () => won);
    const sch = scheduler({
      work: async () => {
        throw new Error("No clone of a/b");
      },
    });
    sch.offer(place, [s("x", 1)]);
    await settle();
    sch.offer(place, [s("x", 1)]);
    await settle();
    expect(place.finished).toEqual([{ id: "x", outcome: "failed", reason: PRIVATE_FAILURE }]);
  });

  test("only a reason written to be shared reaches the app", async () => {
    const place = fakePlace("gatherd.dev", () => won);
    const sch = scheduler({
      work: async () => {
        throw new Shareable("Wake won't run on main, the default branch.");
      },
    });
    sch.offer(place, [s("y", 1)]);
    await settle();
    expect(place.finished[0]?.reason).toBe("Wake won't run on main, the default branch.");
  });

  test("nothing is claimed while paused, and a poke after resuming claims", async () => {
    let paused = true;
    const place = fakePlace("gatherd.dev", () => won);
    const sch = scheduler({
      isPaused: () => paused,
      work: async (_p, x) => ({ id: x.id, outcome: "done" }),
    });
    sch.offer(place, [s("x", 1)]);
    await settle();
    expect(place.claims).toEqual([]);
    paused = false;
    sch.poke();
    await settle();
    expect(place.claims).toEqual(["x"]);
  });

  test("a claim that cannot reach the app waits, then tries again", async () => {
    let now = 0;
    let fail = true;
    const place = fakePlace("gatherd.dev", () => (fail ? new Error("offline") : won));
    const sch = scheduler({
      now: () => now,
      retryMs: 60_000,
      work: async (_p, x) => ({ id: x.id, outcome: "done" }),
    });
    sch.offer(place, [s("x", 1)]);
    await settle();
    sch.poke();
    await settle();
    expect(place.claims).toEqual(["x"]);
    fail = false;
    now = 61_000;
    sch.poke();
    await settle();
    expect(place.claims).toEqual(["x", "x"]);
    expect(place.finished).toEqual([{ id: "x", outcome: "done" }]);
  });
});
