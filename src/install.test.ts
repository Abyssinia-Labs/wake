import { afterAll, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Exec } from "./exec";
import { installDependencies } from "./install";

const root = await mkdtemp(join(tmpdir(), "wake-install-"));
afterAll(() => rm(root, { recursive: true, force: true }));

function recorder(code = 0) {
  const calls: string[][] = [];
  const exec: Exec = async (cmd) => {
    calls.push(cmd);
    return { code, stdout: "", stderr: code ? "error: lockfile had changes" : "" };
  };
  return { calls, exec };
}

test("a Bun repository without node_modules is installed from its lockfile", async () => {
  const cwd = join(root, "bun");
  await mkdir(cwd, { recursive: true });
  await writeFile(join(cwd, "bun.lock"), "{}");
  const { calls, exec } = recorder();
  expect(await installDependencies(exec, cwd, () => {})).toBe(true);
  expect(calls).toEqual([["bun", "install", "--frozen-lockfile"]]);
});

test("nothing is run without a Bun lockfile, or with node_modules already there", async () => {
  const plain = join(root, "plain");
  await mkdir(plain, { recursive: true });
  const ready = join(root, "ready");
  await mkdir(join(ready, "node_modules"), { recursive: true });
  await writeFile(join(ready, "bun.lock"), "{}");
  const { calls, exec } = recorder();
  expect(await installDependencies(exec, plain, () => {})).toBe(false);
  expect(await installDependencies(exec, ready, () => {})).toBe(false);
  expect(calls).toEqual([]);
});

test("a failed install is said, and the run goes on", async () => {
  const cwd = join(root, "failing");
  await mkdir(cwd, { recursive: true });
  await writeFile(join(cwd, "bun.lock"), "{}");
  const said: string[] = [];
  const { exec } = recorder(1);
  expect(await installDependencies(exec, cwd, (line) => said.push(line))).toBe(false);
  expect(said[0]).toContain("bun install failed: error: lockfile had changes");
});
