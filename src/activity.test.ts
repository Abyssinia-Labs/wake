import { expect, test } from "bun:test";
import { mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { activityFile, activityIn, readActivity } from "./activity";

async function folder(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "wake-activity-")), "runs");
}

test("steps go to the run's own file, in the order they came, with their time", async () => {
  const dir = await folder();
  let t = 0;
  const activity = activityIn(dir, () => ++t);
  // Not awaited one by one, as the listener sends them: the order still holds.
  await Promise.all([
    activity.append("gatherd", "s1", "began (opus)"),
    activity.append("gatherd", "s1", "Bash: bun test"),
    activity.append("gatherd", "s2", "began (gpt-6)"),
    activity.append("gatherd", "s1", "finished after 3 turns"),
  ]);
  expect(await readActivity(activityFile(dir, "gatherd", "s1"))).toEqual([
    { at: 1, line: "began (opus)" },
    { at: 2, line: "Bash: bun test" },
    { at: 4, line: "finished after 3 turns" },
  ]);
  expect(await readActivity(activityFile(dir, "gatherd", "s2"))).toEqual([
    { at: 3, line: "began (gpt-6)" },
  ]);
});

test("the folder and each file are the owner's alone", async () => {
  const dir = await folder();
  await activityIn(dir).append("gatherd", "s1", "began");
  expect((await stat(dir)).mode & 0o777).toBe(0o700);
  expect((await stat(activityFile(dir, "gatherd", "s1"))).mode & 0o777).toBe(0o600);
});

test("a step can't carry a terminal escape or a forged line", async () => {
  const dir = await folder();
  await activityIn(dir).append("gatherd", "s1", "said: hi\n2026-01-01 Finished\u001b[2J");
  const [one] = await readActivity(activityFile(dir, "gatherd", "s1"));
  expect(one?.line).toBe("said: hi�2026-01-01 Finished�[2J");
});

test("pruning keeps the runs the history keeps, and nothing else of Wake's", async () => {
  const dir = await folder();
  const activity = activityIn(dir);
  await activity.append("gatherd", "old", "began");
  await activity.append("gatherd", "kept", "began");
  await activity.append("antescript", "kept", "began");
  await writeFile(join(dir, "notes.txt"), "not a run's");
  const gone = await activity.prune([
    { app: "gatherd", summons: "kept" },
    { app: "antescript", summons: "kept" },
  ]);
  expect(gone).toBe(1);
  expect((await readdir(dir)).sort()).toEqual([
    "antescript.kept.ndjson",
    "gatherd.kept.ndjson",
    "notes.txt",
  ]);
});

test("a missing file reads as no steps, and a torn last line is skipped", async () => {
  const dir = await folder();
  expect(await readActivity(activityFile(dir, "gatherd", "none"))).toEqual([]);
  const file = activityFile(dir, "gatherd", "torn");
  await activityIn(dir).append("gatherd", "torn", "began");
  await writeFile(file, '{"at":1,"line":"began"}\n{"at":2,"li', { flag: "a" });
  expect(await readActivity(file)).toEqual([
    { at: expect.any(Number), line: "began" },
    { at: 1, line: "began" },
  ]);
});

test("pruning a folder that isn't there yet removes nothing", async () => {
  expect(await activityIn(join(await folder(), "missing")).prune([])).toBe(0);
});
