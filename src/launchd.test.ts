import { describe, expect, test } from "bun:test";
import type { Exec } from "./exec";
import { appAgent, appAgentOf, LABEL, plist, programArguments } from "./launchd";

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

// `launchctl print gui/501/<label>` on macOS 26, trimmed: Wake's own plist,
// and an agent an app registered with SMAppService (as Microsoft Teams'
// com.microsoft.teams2.agent showed it, 2026-10-23), here under Wake's label.
const OWN = `gui/501/dev.abyssinia.wake = {
	active count = 1
	path = /Users/m/Library/LaunchAgents/dev.abyssinia.wake.plist
	type = LaunchAgent
	state = running

	program = /Users/m/.bun/bin/bun
	arguments = {
		/Users/m/.bun/bin/bun
		/Users/m/.bun/install/global/node_modules/@abyssinia-labs/wake/src/cli.ts
		listen
	}

	stdout path = /Users/m/Library/Logs/Wake/wake.log
}`;
const APP = `gui/501/dev.abyssinia.wake = {
	active count = 1
	path = (submitted by smd.527)
	type = Submitted
	managed_by = com.apple.xpc.ServiceManagement
	state = running

	program identifier = Contents/MacOS/wakectl (mode: 2)
	parent bundle identifier = com.example.listener
	parent bundle version = 1.0
}`;
const OWN_PLIST = "/Users/m/Library/LaunchAgents/dev.abyssinia.wake.plist";

describe("an app's agent", () => {
  test("Wake's own plist is not an app's, wherever its program is", () => {
    expect(appAgentOf(OWN, OWN_PLIST)).toBeNull();
    const fromABundle = OWN.replace(
      "program = /Users/m/.bun/bin/bun",
      "program = /Applications/Some.app/Contents/MacOS/wakectl",
    );
    expect(appAgentOf(fromABundle, OWN_PLIST)).toBeNull();
  });

  test("one registered by an app is named by its bundle, or by its program's .app", () => {
    expect(appAgentOf(APP, OWN_PLIST)).toEqual({ app: "com.example.listener" });
    const withProgram = `${APP}\n\tprogram = /Applications/Some App.app/Contents/MacOS/wakectl`;
    expect(appAgentOf(withProgram, OWN_PLIST)).toEqual({ app: "/Applications/Some App.app" });
    const unnamed = APP.replace(/\tparent bundle identifier = .*\n/, "");
    expect(appAgentOf(unnamed, OWN_PLIST)).toEqual({});
    const plain =
      "gui/501/dev.abyssinia.wake = {\n\tpath = /Library/LaunchAgents/x.plist\n\tprogram = /usr/local/bin/wakectl\n}";
    expect(appAgentOf(plain, OWN_PLIST)).toBeNull();
  });

  test("asks launchd for the label; nothing registered is no app", async () => {
    const asked: string[][] = [];
    const none: Exec = async (cmd) => {
      asked.push(cmd);
      return { code: 113, stdout: "", stderr: "Could not find service" };
    };
    expect(await appAgent(none)).toBeNull();
    expect(asked[0]?.slice(0, 2)).toEqual(["launchctl", "print"]);
    expect(asked[0]?.[2]).toEndWith(`/${LABEL}`);
    const registered: Exec = async () => ({ code: 0, stdout: APP, stderr: "" });
    expect(await appAgent(registered)).toEqual({ app: "com.example.listener" });
  });
});
