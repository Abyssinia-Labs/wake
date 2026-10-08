import { describe, expect, test } from "bun:test";
import { LABEL, plist, programArguments } from "./launchd";

describe("launchd", () => {
  test("starts the script through Bun, or a compiled binary alone", () => {
    expect(programArguments("/opt/bun/bin/bun", "/x/src/cli.ts")).toEqual([
      "/opt/bun/bin/bun",
      "/x/src/cli.ts",
      "listen",
    ]);
    expect(programArguments("/opt/homebrew/bin/wakectl", "/$bunfs/root/wakectl")).toEqual([
      "/opt/homebrew/bin/wakectl",
      "listen",
    ]);
  });

  test("escapes what it writes and keeps the PATH it was given", () => {
    const xml = plist({
      args: ["/a&b/bun", "listen"],
      env: { PATH: "/usr/bin:<x>" },
      log: "/l.log",
    });
    expect(xml).toContain(`<string>${LABEL}</string>`);
    expect(xml).toContain("<string>/a&amp;b/bun</string>");
    expect(xml).toContain("<string>/usr/bin:&lt;x&gt;</string>");
    expect(xml).toContain("<key>KeepAlive</key>");
  });
});
