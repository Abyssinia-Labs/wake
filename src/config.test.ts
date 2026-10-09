import { afterAll, expect, test } from "bun:test";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keepPrivate, type Paths, writeJson } from "./config";
import { plain } from "./log";

const dir = await mkdtemp(join(tmpdir(), "wake-config-"));
afterAll(() => rm(dir, { recursive: true, force: true }));

const modeOf = async (path: string): Promise<number> => (await stat(path)).mode & 0o777;

test("Wake's files are the person's alone, an older install's included", async () => {
  const home = join(dir, "home");
  const p: Paths = {
    home,
    config: join(home, "config.json"),
    state: join(home, "state.json"),
    paused: join(home, "paused"),
    worktrees: join(home, "worktrees"),
    made: join(home, "worktrees.json"),
    rooms: join(home, "rooms"),
    log: join(dir, "logs", "wake.log"),
  };
  await writeJson(p.config, { apps: {} });
  expect(await modeOf(p.config)).toBe(0o600);
  await writeFile(p.state, "{}", { mode: 0o644 });
  await keepPrivate(p);
  expect(await modeOf(home)).toBe(0o700);
  expect(await modeOf(p.state)).toBe(0o600);
  expect(await modeOf(p.log)).toBe(0o600);
});

test("a log line can't carry a newline or a terminal escape", () => {
  expect(plain("GAT-1\n2026-01-01T00:00:00Z Forged\u001b[2J")).toBe(
    "GAT-1�2026-01-01T00:00:00Z Forged�[2J",
  );
});
