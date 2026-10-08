import { afterAll, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { trustCodexFolder, untrustCodexFolder } from "./codex-trust";

const dir = await mkdtemp(join(tmpdir(), "wake-codex-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

test("trusts a worktree once, marked as Wake's, and takes out only that", async () => {
  const file = join(dir, "config.toml");
  const before =
    'model = "gpt"\n\n[projects."/Users/m/Projects/take-one"]\ntrust_level = "trusted"\n';
  await writeFile(file, before);
  const folder = "/Users/m/.codex/worktrees/wake/gatherd/gat-31-x.y";
  expect(await trustCodexFolder(folder, file)).toBe(true);
  expect(await trustCodexFolder(folder, file)).toBe(false);
  const during = await readFile(file, "utf8");
  expect(during).toContain(`[projects."${folder}"]\ntrust_level = "trusted"`);
  expect(during.match(/Added by Wake/g)).toHaveLength(1);
  expect(await untrustCodexFolder(folder, file)).toBe(true);
  expect(await readFile(file, "utf8")).toBe(before);
});

test("never takes out an entry the person added", async () => {
  const file = join(dir, "own.toml");
  const own = '[projects."/Users/m/x"]\ntrust_level = "trusted"\n';
  await writeFile(file, own);
  expect(await untrustCodexFolder("/Users/m/x", file)).toBe(false);
  expect(await readFile(file, "utf8")).toBe(own);
});
