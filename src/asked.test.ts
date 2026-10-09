import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readAsked, recordAsked } from "./asked";
import { repoOptions } from "./commands/setup";
import { someOf } from "./ui";

const dir = await mkdtemp(join(tmpdir(), "wake-asked-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

test("each app's asked-for repositories are kept, lower-cased, once; nothing new writes nothing", async () => {
  const path = join(dir, "asked.json");
  await recordAsked(path, "Gatherd.dev", ["Abyssinia-Labs/Gatherd", "../etc", "acme/widgets"]);
  await recordAsked(path, "gatherd.dev", ["abyssinia-labs/gatherd"]);
  const before = (await stat(path)).mtimeMs;
  await recordAsked(path, "gatherd.dev", ["acme/widgets"]);
  expect((await stat(path)).mtimeMs).toBe(before);
  expect(await readAsked(path)).toEqual({
    "gatherd.dev": ["abyssinia-labs/gatherd", "acme/widgets"],
  });
  expect(await readAsked(join(dir, "missing.json"))).toEqual({});
});

test("setup lists what the app asked for first, saying so", () => {
  const clones = [
    { repo: "acme/a", path: "/p/a" },
    { repo: "acme/b", path: "/p/b" },
    { repo: "acme/c", path: "/p/c" },
  ];
  const options = repoOptions(clones, ["acme/c"]);
  expect(options.map((o) => o.value)).toEqual(["acme/c", "acme/a", "acme/b"]);
  expect(options[0]?.hint).toContain("asked for before");
  expect(options[1]?.hint).not.toContain("asked for before");
});

test("a long list is a count and the first few", () => {
  expect(someOf(["a", "b"], "repositories")).toBe("a, b");
  const forty = Array.from({ length: 40 }, (_, i) => `r${i}`);
  expect(someOf(forty, "repositories")).toBe("40 repositories: r0, r1, r2 and 37 more");
});
