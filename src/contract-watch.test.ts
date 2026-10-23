import { describe, expect, test } from "bun:test";
import { ContractError } from "./contract";
import { asPlaces, asRuns, asWatched, asWatching, MAX_REASON, NOT_IN_PLAN } from "./contract-watch";

const agent = { id: "a1", name: "Claude", tool: "claude" } as const;
const summons = {
  id: "s1",
  app: "acme",
  kind: "assigned",
  target: { kind: "ticket", ref: "ACME-70", url: "https://acme.dev/t/ACME-70" },
  repo: "acme/widgets",
  branch: "acme-70-fix-the-thing",
  at: 1,
};
const claimed = {
  ...summons,
  state: "claimed",
  run: { name: "amber-heron", tool: "claude", session: "4f9c2d1e", startedAt: 2 },
  place: { name: "Ada's MacBook" },
  waiting: true,
} as const;

describe("adding a device", () => {
  test("reads the watch key, the app and the agent", () => {
    const watched = { watchKey: `gwk_${"a".repeat(64)}`, app: "acme", agent };
    expect(asWatched(watched)).toEqual(watched);
  });
  test("refuses a short key, an app that isn't a name, an agent without one", () => {
    const good = { watchKey: `gwk_${"a".repeat(64)}`, app: "acme", agent };
    for (const bad of [
      { ...good, watchKey: "short" },
      { ...good, app: "../x" },
      { ...good, agent: { id: "a1", name: "Claude\u001b[2J" } },
      { ...good, agent: undefined },
    ]) {
      expect(() => asWatched(bad)).toThrow(ContractError);
    }
  });
});

describe("wake:runs", () => {
  test("keeps a claimed summons with its run, place and wait", () => {
    expect(asRuns([claimed])).toEqual({ summonses: [claimed], rejected: 0 });
  });
  test("an ask names who asked, and nothing else does", () => {
    const asking = { ...summons, state: "asking", asker: { name: "Grace" } } as const;
    expect(asRuns([asking]).summonses).toEqual([asking]);
    expect(asRuns([{ ...asking, asker: undefined }]).rejected).toBe(1);
    const open = asRuns([{ ...summons, state: "open", asker: { name: "Grace" } }]);
    expect(open.summonses[0]?.asker).toBeUndefined();
  });
  test("a run that isn't waiting may say false or nothing", () => {
    const { summonses } = asRuns([{ ...claimed, waiting: false }]);
    expect(summonses[0]?.waiting).toBeUndefined();
  });
  test("an ended one keeps when it ended and why", () => {
    const failed = { ...claimed, state: "failed", waiting: undefined, endedAt: 3, reason: "No." };
    expect(asRuns([failed]).summonses[0]).toMatchObject({ endedAt: 3, reason: "No." });
  });
  test("skips one that breaks a rule, and counts it", () => {
    const bad = [
      { ...claimed, state: "running" },
      { ...claimed, id: "s 1" },
      { ...claimed, run: { ...claimed.run, name: "Amber Heron" } },
      { ...claimed, run: { ...claimed.run, tool: "vim" } },
      { ...claimed, run: { ...claimed.run, session: "../x" } },
      { ...claimed, place: { name: "Mac\u0007" } },
      { ...claimed, waiting: "yes" },
      { ...claimed, endedAt: "today" },
      { ...claimed, reason: "x".repeat(MAX_REASON + 1) },
    ];
    expect(asRuns([...bad, claimed])).toEqual({ summonses: [claimed], rejected: bad.length });
  });
  test("a list is required", () => {
    expect(() => asRuns({})).toThrow(ContractError);
  });
});

describe("wake:places", () => {
  test("keeps the places, a claim's time when there is one", () => {
    const place = { name: "Ada's MacBook", platform: "darwin", pairedAt: 1, lastClaimAt: 2 };
    const fresh = { name: "build box", platform: "linux", pairedAt: 3 };
    expect(asPlaces([place, fresh])).toEqual({ places: [place, fresh], rejected: 0 });
  });
  test("skips a place with a name or platform it can't show", () => {
    const bad = [
      { name: "", platform: "darwin", pairedAt: 1 },
      { name: "Mac", platform: "Darwin OS", pairedAt: 1 },
      { name: "Mac", platform: "darwin" },
      { name: "Mac", platform: "darwin", pairedAt: 1, lastClaimAt: "never" },
    ];
    expect(asPlaces(bad).rejected).toBe(bad.length);
    expect(() => asPlaces(null)).toThrow(ContractError);
  });
});

describe("wake:watching", () => {
  test("says what the plan includes", () => {
    const watching = { app: "acme", agent, devices: "included", alerts: NOT_IN_PLAN } as const;
    expect(asWatching(watching)).toEqual(watching);
  });
  test("refuses an answer it can't read as either", () => {
    const watching = { app: "acme", agent, devices: "included", alerts: "trial" };
    expect(() => asWatching(watching)).toThrow(ContractError);
    expect(() => asWatching({ ...watching, alerts: "included", app: "" })).toThrow(ContractError);
  });
});
