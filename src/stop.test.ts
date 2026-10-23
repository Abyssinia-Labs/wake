import { expect, test } from "bun:test";
import { mkdtemp, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnClaude } from "./claude";
import { promptUntilTurnEnds } from "./herdr-prompt";
import type { RunState } from "./state";
import { findRunning, requestStop, STOPPED, takeStops } from "./stop";

async function folder(): Promise<string> {
  return join(await mkdtemp(join(tmpdir(), "wake-stop-")), "stop");
}

test("a request is a private file named for the summons, taken once", async () => {
  const dir = await folder();
  await requestStop(dir, "s-1");
  await requestStop(dir, "s_2");
  expect((await stat(dir)).mode & 0o777).toBe(0o700);
  expect((await stat(join(dir, "s-1"))).mode & 0o777).toBe(0o600);
  expect((await takeStops(dir)).sort()).toEqual(["s-1", "s_2"]);
  expect(await takeStops(dir)).toEqual([]);
});

test("a request can't name a path, and a stray file is cleared without stopping anything", async () => {
  const dir = await folder();
  await expect(requestStop(dir, "../config.json")).rejects.toThrow("isn't a summons id");
  await requestStop(dir, "s-1");
  await writeFile(join(dir, "notes.txt"), "");
  expect(await takeStops(dir)).toEqual(["s-1"]);
  expect(await readdir(dir)).toEqual([]);
});

test("taking requests from a folder that isn't there finds none", async () => {
  expect(await takeStops(join(await folder(), "missing"))).toEqual([]);
});

const runs: RunState[] = [
  {
    app: "gatherd",
    ref: "GAT-71",
    sessionId: "f1d586c9",
    cwd: "/w",
    startedAt: 1,
    name: "amber-heron",
    summons: "s1",
  },
  { app: "gatherd", ref: "GAT-70", sessionId: "", cwd: "/w", startedAt: 2, summons: "s2" },
];

test("a run is found by its name, its ticket or its session id", () => {
  expect(findRunning(runs, "amber-heron")?.summons).toBe("s1");
  expect(findRunning(runs, "gat-70")?.summons).toBe("s2");
  expect(findRunning(runs, "F1D586C9")?.summons).toBe("s1");
  // A run that hasn't said its session yet isn't found by an empty one.
  expect(findRunning(runs, "")).toBeUndefined();
  expect(findRunning(runs, "quiet-otter")).toBeUndefined();
});

test("a headless tool ends when its run is stopped", async () => {
  const stopper = new AbortController();
  const begun = Date.now();
  const ending = spawnClaude(["sleep", "30"], {
    cwd: tmpdir(),
    stdin: "",
    timeoutMs: 60_000,
    onLine: () => {},
    signal: stopper.signal,
  });
  setTimeout(() => stopper.abort(), 50);
  const done = await ending;
  expect(done.code).not.toBe(0);
  expect(done.timedOut).toBe(false);
  expect(Date.now() - begun).toBeLessThan(5_000);
});

test("in herdr, a stopped run's turn is interrupted with Esc and its tab kept", async () => {
  const sent: string[][] = [];
  const stopper = new AbortController();
  const said: string[] = [];
  const result = promptUntilTurnEnds(
    async (cmd) => {
      sent.push(cmd);
      // The wait for the turn to end never comes back on its own here.
      if (cmd[2] === "prompt") return await new Promise(() => {});
      return { code: 0, stdout: "", stderr: "" };
    },
    {
      name: "wake-gat-71-abc",
      text: "Do it.",
      timeoutMs: 60_000,
      settle: false,
      signal: stopper.signal,
      onEvent: (line) => said.push(line),
    },
  );
  setTimeout(() => stopper.abort(), 10);
  expect(await result).toEqual({ ok: false, reason: STOPPED });
  expect(sent.at(-1)).toEqual(["herdr", "agent", "send-keys", "wake-gat-71-abc", "esc"]);
  expect(said.join(" ")).toContain("tab stays open");
});
