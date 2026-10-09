import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resumeArgs } from "./commands/open";
import { findRun, type RunRecord, readHistory, recordRun } from "./history";

const home = await mkdtemp(join(tmpdir(), "wake-history-"));
afterAll(() => rm(home, { recursive: true, force: true }));

const run: RunRecord = {
  name: "amber-heron",
  summons: "s1",
  app: "gatherd",
  ref: "GAT-31",
  tool: "codex",
  sessionId: "",
  cwd: "/tmp/x",
  startedAt: 1,
};

test("a run is kept by name, its session and outcome merged in as they come", async () => {
  const path = join(home, "runs.json");
  await recordRun(path, run);
  await recordRun(path, { ...run, sessionId: "0199-abc" });
  await recordRun(path, { ...run, sessionId: "0199-abc", finishedAt: 9, outcome: "done" });
  const all = await readHistory(path);
  expect(all).toEqual([{ ...run, sessionId: "0199-abc", finishedAt: 9, outcome: "done" }]);
  expect(findRun(all, "Amber-Heron ")?.summons).toBe("s1");
  expect(findRun(all, "0199-ABC")?.name).toBe("amber-heron");
  expect(findRun(all, "nobody")).toBeUndefined();
});

test("the latest of two runs with one name is the one opened", () => {
  const later = { ...run, summons: "s2", startedAt: 5 };
  expect(findRun([run, later], "amber-heron")?.summons).toBe("s2");
});

test("each tool resumes with its own command", () => {
  expect(resumeArgs("claude", "id")).toEqual(["claude", "--resume", "id"]);
  expect(resumeArgs("codex", "id")).toEqual(["codex", "resume", "id"]);
  expect(resumeArgs("cursor", "id")).toEqual(["cursor-agent", "--resume", "id"]);
});
