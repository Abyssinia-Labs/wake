import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allow, permissions } from "./commands/settings";
import { loadConfig } from "./config";

let home = "";
beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "wake-settings-"));
  process.env.WAKE_HOME = home;
});
afterAll(async () => {
  delete process.env.WAKE_HOME;
  await rm(home, { recursive: true, force: true });
});

test("permissions take the three a run may use, and refuse bypassPermissions", async () => {
  expect((await loadConfig()).permissionMode).toBe("acceptEdits");
  await permissions("auto");
  expect((await loadConfig()).permissionMode).toBe("auto");
  await expect(permissions("bypassPermissions")).rejects.toThrow("not offered");
  await expect(permissions("plan")).rejects.toThrow("one of acceptEdits, auto, dontAsk");
});

test("a bypassPermissions written into the file by hand is read as the default", async () => {
  await writeFile(
    join(home, "config.json"),
    JSON.stringify({ permissionMode: "bypassPermissions" }),
  );
  expect((await loadConfig()).permissionMode).toBe("acceptEdits");
});

test("allow adds a rule once, and --remove takes it back", async () => {
  await allow("Bash(npm test:*)", false);
  await allow("Bash(npm test:*)", false);
  expect((await loadConfig()).extraAllowedTools).toEqual(["Bash(npm test:*)"]);
  await allow("Bash(npm test:*)", true);
  expect((await loadConfig()).extraAllowedTools).toEqual([]);
});
