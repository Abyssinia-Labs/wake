import { afterEach, describe, expect, test } from "bun:test";
import { colorLogLine } from "./log-colors";
import { closest, colorOn, green, pad, spin, tildify } from "./ui";

const saved = { NO_COLOR: process.env.NO_COLOR, FORCE_COLOR: process.env.FORCE_COLOR };
afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("colour", () => {
  test("off for a pipe and under NO_COLOR, on under FORCE_COLOR", () => {
    delete process.env.FORCE_COLOR;
    delete process.env.NO_COLOR;
    expect(colorOn({ isTTY: false, write: () => true })).toBe(false);
    process.env.NO_COLOR = "1";
    expect(colorOn({ isTTY: true, write: () => true })).toBe(false);
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = "1";
    expect(green("ok")).toBe("\x1b[32mok\x1b[39m");
  });

  test("padding counts what shows, not the codes", () => {
    process.env.FORCE_COLOR = "1";
    expect(pad(green("ab"), 4)).toBe(`${green("ab")}  `);
  });
});

test("a home path is written with ~", () => {
  expect(tildify("/Users/m/Projects/gatherd", "/Users/m")).toBe("~/Projects/gatherd");
  expect(tildify("/opt/x", "/Users/m")).toBe("/opt/x");
});

test("a typo gets the command it was close to, and nonsense gets none", () => {
  const commands = ["status", "install", "pair", "permissions"];
  expect(closest("stauts", commands)).toBe("status");
  expect(closest("instal", commands)).toBe("install");
  expect(closest("permisions", commands)).toBe("permissions");
  expect(closest("xyzzy", commands)).toBeUndefined();
});

test("off a terminal the spinner draws nothing, and still passes the result through", async () => {
  delete process.env.FORCE_COLOR;
  const drawn: string[] = [];
  const result = await spin("Pairing", async () => 42, undefined, {
    isTTY: false,
    write: (t) => drawn.push(t),
  });
  expect(result).toBe(42);
  expect(drawn).toEqual([]);
});

describe("log lines", () => {
  test("plain without colour, the stamp in local time with it", () => {
    delete process.env.FORCE_COLOR;
    process.env.NO_COLOR = "1";
    const line = "2026-10-08T19:28:07.552Z Claimed GAT-20 on gatherd.dev (mentioned).";
    expect(colorLogLine(line)).toMatch(/^\d{2}:\d{2}:\d{2} Claimed GAT-20/);
    expect(colorLogLine("not a log line")).toBe("not a log line");
  });

  test("a step names its ticket in colour", () => {
    process.env.FORCE_COLOR = "1";
    delete process.env.NO_COLOR;
    const line = colorLogLine("2026-10-08T19:28:15.736Z GAT-20: getticket: GAT-20");
    expect(line).toContain("\x1b[35mGAT-20\x1b[39m");
  });
});
