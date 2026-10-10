import { describe, expect, test } from "bun:test";
import {
  asClaim,
  asDiscovery,
  asPaired,
  asSummonses,
  ContractError,
  isBranch,
  isRepo,
  MAX_PROMPT,
} from "./contract";

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
  test("reads wake/v1: Convex when no transport is named", () => {
    const urls = { convexUrl: "https://c.convex.cloud", httpBase: "https://api.gatherd.dev" };
    expect(asDiscovery({ version: "wake/v1", ...urls })).toEqual({
      version: "wake/v1",
      transport: "convex",
      ...urls,
    });
  });
  test("reads the HTTP transport, which needs no Convex deployment", () => {
    expect(
      asDiscovery({ version: "wake/v1", transport: "http", httpBase: "https://api.acme.dev" }),
    ).toEqual({ version: "wake/v1", transport: "http", httpBase: "https://api.acme.dev" });
    expect(() =>
      asDiscovery({ version: "wake/v1", transport: "http", httpBase: "http://acme.dev" }),
    ).toThrow(/https/);
  });
  test("a transport Wake doesn't speak asks for an update", () => {
    expect(() =>
      asDiscovery({ version: "wake/v1", transport: "grpc", httpBase: "https://a.dev" }),
    ).toThrow(/grpc; update Wake/);
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

describe("what an app may send (the security pass)", () => {
  test("discovery URLs are https, or http on this machine only", () => {
    const at =
      (convexUrl: string, httpBase = "https://api.gatherd.dev") =>
      () =>
        asDiscovery({ version: "wake/v1", convexUrl, httpBase });
    expect(at("http://c.convex.cloud")).toThrow(ContractError);
    expect(at("https://c.convex.cloud", "http://api.gatherd.dev")).toThrow(ContractError);
    expect(at("file:///etc/passwd")).toThrow(ContractError);
    expect(at("https://user:pw@c.convex.cloud")).toThrow(ContractError);
    expect(at("http://127.0.0.1:3210", "http://localhost:3211")()).toMatchObject({
      httpBase: "http://localhost:3211",
    });
  });

  test("a pairing's app is a plain name, never a path or a tool list", () => {
    const pair = (app: string, name = "Claude") =>
      asPaired({ placeKey: `gwk_${"a".repeat(64)}`, app, agent: { id: "a1", name } });
    expect(pair("gatherd").app).toBe("gatherd");
    for (const bad of ["../../..", "gatherd Bash", "Gatherd", "a/b", ""]) {
      expect(() => pair(bad)).toThrow(ContractError);
    }
    expect(() => pair("gatherd", "Claude\u001b[2J")).toThrow(ContractError);
    expect(() => pair("gatherd", "x".repeat(65))).toThrow(ContractError);
  });

  test("summons fields are bounded", () => {
    const bad = [
      { ...summons, id: "s 1" },
      { ...summons, app: "../x" },
      { ...summons, target: { ...summons.target, ref: "GAT-1\u001b]0;pwned\u0007" } },
      { ...summons, target: { ...summons.target, ref: "x".repeat(65) } },
      { ...summons, target: { ...summons.target, url: "javascript:alert(1)" } },
    ];
    expect(asSummonses(bad).rejected).toBe(bad.length);
    const page = {
      ...summons,
      target: { kind: "page", ref: "Launch plan", url: summons.target.url },
    };
    expect(asSummonses([page]).summonses).toHaveLength(1);
  });

  test("a prompt is bounded", () => {
    const run = (prompt: string) => () => asClaim({ claimed: true, run: { prompt } });
    expect(run("x".repeat(MAX_PROMPT))()).toMatchObject({ claimed: true });
    expect(run("x".repeat(MAX_PROMPT + 1))).toThrow(ContractError);
  });
});
