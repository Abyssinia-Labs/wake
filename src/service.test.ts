import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { install, uninstall } from "./commands/service";
import type { Daemon } from "./daemon";
import type { Exec } from "./exec";
import type { AppAgent } from "./launchd";

let dir = "";
const home = process.env.WAKE_HOME;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "wake-service-"));
  process.env.WAKE_HOME = join(dir, "home");
});
afterEach(async () => {
  if (home === undefined) delete process.env.WAKE_HOME;
  else process.env.WAKE_HOME = home;
  await rm(dir, { recursive: true, force: true });
});

const run: Exec = async () => ({ code: 0, stdout: "", stderr: "" });

/** A LaunchAgent that records what was asked of it, with an app's or not. */
function daemon(app: AppAgent | null): Daemon & { did: string[] } {
  const did: string[] = [];
  return {
    did,
    name: "LaunchAgent",
    path: join(dir, "dev.abyssinia.wake.plist"),
    file: () => "<plist/>",
    start: async () => void did.push("start"),
    stop: async () => {
      did.push("stop");
      return true;
    },
    restart: async () => true,
    appAgent: async () => app,
  };
}

test("an app's listener: install writes no plist of Wake's and starts nothing", async () => {
  const d = daemon({ app: "com.example.listener" });
  await install(run, d);
  expect(d.did).toEqual([]);
  expect(existsSync(d.path)).toBe(false);
});

test("an app's listener: uninstall stops nothing, and removes only Wake's own plist", async () => {
  const d = daemon({});
  await uninstall(run, d);
  expect(d.did).toEqual([]);
  await writeFile(d.path, "<plist/>");
  await uninstall(run, d);
  expect(d.did).toEqual([]);
  expect(existsSync(d.path)).toBe(false);
});

test("no app: install writes Wake's plist and starts it; uninstall stops and removes it", async () => {
  const d = daemon(null);
  await install(run, d);
  expect(d.did).toEqual(["start"]);
  expect(await Bun.file(d.path).text()).toBe("<plist/>");
  await uninstall(run, d);
  expect(d.did).toEqual(["start", "stop"]);
  expect(existsSync(d.path)).toBe(false);
});
