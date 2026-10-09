import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLines, readPairLine, setupFlow } from "./commands/setup";
import { loadConfig, saveConfig } from "./config";
import type { Probe } from "./doctor";
import { type Exec, exec, git } from "./exec";
import type { Io } from "./prompt";

const dir = await mkdtemp(join(tmpdir(), "wake-setup-"));
const saved = process.env.WAKE_HOME;

beforeAll(async () => {
  process.env.WAKE_HOME = join(dir, "wake");
  process.env.NO_COLOR = "1";
  // Two clones under ~/code with GitHub origins.
  for (const name of ["widgets", "gadgets"]) {
    const clone = join(dir, "code", name);
    await mkdir(clone, { recursive: true });
    await git(exec, ["init", "--quiet"], clone);
    await git(exec, ["remote", "add", "origin", `git@github.com:acme/${name}.git`], clone);
  }
});
afterAll(async () => {
  if (saved === undefined) delete process.env.WAKE_HOME;
  else process.env.WAKE_HOME = saved;
  await rm(dir, { recursive: true, force: true });
});

/** A terminal that gives these answers in order, and keeps what was said. */
function scripted(answers: string[]): Io & { said: string[] } {
  const said: string[] = [];
  return {
    said,
    ask: async () => answers.shift() ?? "",
    say: (line) => said.push(line),
    close: () => {},
  };
}

/** A machine with git, gh, Claude Code and herdr; git itself is real, for the clones. */
const ready: Exec = async (cmd, options) => {
  if (cmd[0] === "git") return await exec(cmd, options);
  const missing =
    cmd[0] === "/usr/bin/which" && !["git", "gh", "claude", "herdr"].includes(cmd[1] ?? "");
  return { code: missing ? 1 : 0, stdout: "", stderr: "" };
};

test("an agent's pair command is read as it prints it, or as bare words", () => {
  expect(readPairLine("wakectl pair app.example.com K7QD-2M9X --tool codex")).toEqual({
    domain: "app.example.com",
    code: "K7QD-2M9X",
    tool: "codex",
  });
  expect(readPairLine("  app.example.com k7qd2m9x ")).toEqual({
    domain: "app.example.com",
    code: "k7qd2m9x",
  });
  expect(readPairLine("hello")).toBeNull();
});

test("a first setup: folders, pairing, repositories, runs, install", async () => {
  await saveConfig({ ...(await loadConfig()), roots: [join(dir, "nowhere")] });
  const installed: string[] = [];
  let plist = false;
  const probe = async (): Promise<Probe> => ({
    platform: "darwin",
    bunVersion: "1.3.3",
    exists: (path) => (path === "/p.plist" ? plist : existsSync(path)),
    plist: "/p.plist",
    listener: plist ? 7 : null,
    paused: false,
  });
  const io = scripted([
    "1", // folders: the only existing candidate, ~/code
    "not a command",
    "wakectl pair app.example.com K7QD-2M9X",
    "2", // repositories: acme/widgets (sorted: gadgets, widgets)
    "1", // runs open in herdr
    "2", // permissions: auto
    "y", // install
  ]);
  await setupFlow({
    io,
    run: ready,
    probe,
    home: dir,
    pair: async (domain) => {
      const config = await loadConfig();
      config.apps[`${domain}/claude-a1`] = {
        domain,
        app: "example",
        agent: { id: "a1", name: "Claude" },
        convexUrl: "https://c",
        httpBase: "https://h",
        pairedAt: 1,
      };
      await saveConfig(config);
    },
    install: async () => {
      installed.push("yes");
      plist = true;
    },
  });
  const config = await loadConfig();
  expect(config.roots).toEqual([join(dir, "code")]);
  expect(config.repos).toEqual({ "app.example.com": ["acme/widgets"] });
  expect(config.run).toBe("herdr");
  expect(config.permissionMode).toBe("auto");
  expect(installed).toEqual(["yes"]);
  expect(io.said.some((line) => line.includes("isn't a pair command"))).toBe(true);
  expect(io.said.join("\n")).toContain("Listening (pid 7)");
});

test("a machine without an agent stops at the checks, saying how to fix it", async () => {
  const io = scripted([]);
  await setupFlow({
    io,
    run: async (cmd) => ({ code: cmd[1] === "git" ? 0 : 1, stdout: "", stderr: "" }),
    probe: async () => ({
      platform: "darwin",
      bunVersion: "1.3.3",
      exists: () => true,
      plist: "/p",
      listener: null,
      paused: false,
    }),
    home: dir,
    pair: async () => {},
    install: async () => {},
  });
  expect(io.said.join("\n")).toContain("Fix what's marked");
  expect(checkLines([{ level: "fail", what: "x", fix: "do y" }]).join("\n")).toContain("do y");
});

test("approving more than ten repositories at once is confirmed, and no asks again", async () => {
  const many = join(dir, "many");
  for (let i = 0; i < 12; i++) {
    const clone = join(many, `r${String(i).padStart(2, "0")}`);
    await mkdir(clone, { recursive: true });
    await git(exec, ["init", "--quiet"], clone);
    await git(
      exec,
      ["remote", "add", "origin", `git@github.com:acme/r${String(i).padStart(2, "0")}.git`],
      clone,
    );
  }
  const config = await loadConfig();
  await saveConfig({ ...config, roots: [many], repos: {} });
  const io = scripted([
    "", // folders: keep ~/many
    "", // no new pairing
    "all", // every clone...
    "", // ...not confirmed (the default is no)
    "1 2", // so it asks again
    "", // runs: herdr
    "", // permissions: as they are
  ]);
  await setupFlow({
    io,
    run: ready,
    probe: async () => ({
      platform: "darwin",
      bunVersion: "1.3.3",
      exists: (path) => path === "/p.plist" || existsSync(path),
      plist: "/p.plist",
      listener: 9,
      paused: false,
    }),
    home: dir,
    pair: async () => {},
    install: async () => {},
    askedPath: join(dir, "asked-none.json"),
  });
  expect((await loadConfig()).repos).toEqual({ "app.example.com": ["acme/r00", "acme/r01"] });
  expect(io.said.join("\n")).not.toContain("acme/r00, acme/r01, acme/r02, acme/r03");
});
