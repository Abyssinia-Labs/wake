import { describe, expect, test } from "bun:test";
import { asClaim, asDiscovery, asSummonses, ContractError, isBranch, isRepo } from "./contract";

const summons = {
  id: "s1",
  app: "gatherd",
  kind: "assigned",
  target: { kind: "ticket", ref: "GAT-70", url: "https://gatherd.dev/w/a/t/GAT-70" },
  repo: "Abyssinia-Labs/gatherd",
  branch: "gat-70-fix-the-thing",
  at: 1,
};

describe("discovery", () => {
  test("reads wake/v1", () => {
    expect(asDiscovery({ version: "wake/v1", convexUrl: "c", httpBase: "h" })).toEqual({
      version: "wake/v1",
      convexUrl: "c",
      httpBase: "h",
    });
  });
  test("says which version an app speaks when it is not ours", () => {
    expect(() => asDiscovery({ version: "wake/v2", convexUrl: "c", httpBase: "h" })).toThrow(
      /wake\/v2; update Wake/,
    );
  });
});

describe("summonses", () => {
  test("keeps valid ones, ignores additive fields, counts the rest", () => {
    const { summonses, rejected } = asSummonses([
      { ...summons, extra: true },
      { ...summons, id: "" },
      "nonsense",
    ]);
    expect(summonses).toEqual([summons]);
    expect(rejected).toBe(2);
  });
  test("a summons without a repository is a room's", () => {
    const { repo: _r, branch: _b, ...page } = summons;
    expect(asSummonses([page]).summonses[0]?.repo).toBeUndefined();
  });
  test("a repository needs its branch", () => {
    expect(asSummonses([{ ...summons, branch: undefined }]).rejected).toBe(1);
  });
  test("refuses names git would read as options or paths", () => {
    for (const branch of ["-delete", "a/../b", "a//b", "x.lock", "a b", "a/"]) {
      expect(isBranch(branch)).toBe(false);
    }
    for (const repo of ["-x/y", "a/b/c", "../b", "a/.."]) expect(isRepo(repo)).toBe(false);
    expect(isBranch("gat-70-a.b/c_d")).toBe(true);
  });
  test("a list is required", () => {
    expect(() => asSummonses({})).toThrow(ContractError);
  });
});

describe("claims", () => {
  test("a lost claim and a won one", () => {
    expect(asClaim({ claimed: false })).toEqual({ claimed: false });
    expect(asClaim({ claimed: true, run: { prompt: "Read GAT-70." } })).toEqual({
      claimed: true,
      run: { prompt: "Read GAT-70." },
    });
  });
  test("a won claim must say what to run", () => {
    expect(() => asClaim({ claimed: true, run: {} })).toThrow(ContractError);
  });
});
