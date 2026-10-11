import { expect, test } from "bun:test";
import { paths } from "./config";
import { linuxChecks } from "./doctor-linux";
import type { Exec } from "./exec";
import { unit, unitPath } from "./systemd";

test("the unit runs Wake with the install shell's PATH, restarts it, and logs to Wake's log", () => {
  const text = unit({
    args: ["/home/ada/.bun/bin/bun", "/home/ada/wake/src/cli.ts", "listen"],
    env: { PATH: "/usr/bin:/home/ada/.bun/bin", HOME: "/home/ada" },
    log: "/home/ada/.local/state/wake/wake.log",
  });
  expect(text).toContain('ExecStart="/home/ada/.bun/bin/bun" "/home/ada/wake/src/cli.ts" "listen"');
  expect(text).toContain('Environment="PATH=/usr/bin:/home/ada/.bun/bin"');
  expect(text).toContain("Restart=always");
  expect(text).toContain("StandardOutput=append:/home/ada/.local/state/wake/wake.log");
  expect(text).toContain("WantedBy=default.target");
  // A % is systemd's specifier; a quote would end the word.
  expect(unit({ args: ['a"b%c'], env: {}, log: "/l" })).toContain('ExecStart="a\\"b%%c"');
});

test("Linux keeps Wake in the XDG folders, and the unit where systemd looks", () => {
  const env = { XDG_CONFIG_HOME: "/x/config", XDG_STATE_HOME: "/x/state" };
  const p = paths(env, "linux");
  expect(p.config).toBe("/x/config/wake/config.json");
  expect(p.log).toBe("/x/state/wake/wake.log");
  expect(unitPath(env)).toBe("/x/config/systemd/user/wake.service");
  expect(paths({ WAKE_HOME: "/w" }, "linux").log).toBe("/w/wake.log");
  expect(paths({}, "darwin").home).toContain("Library/Application Support/Wake");
});

function machine(o: { has: string[]; session: boolean; linger: boolean }): Exec {
  return async (cmd) => {
    const [first, second, third] = cmd;
    if (first === "/usr/bin/which")
      return { code: o.has.includes(second ?? "") ? 0 : 1, stdout: "", stderr: "" };
    if (first === "systemctl") return { code: o.session ? 0 : 1, stdout: "", stderr: "" };
    if (first === "loginctl" && third)
      return { code: 0, stdout: `Linger=${o.linger ? "yes" : "no"}\n`, stderr: "" };
    return { code: 1, stdout: "", stderr: "" };
  };
}

test("doctor on Linux: the sandbox's tools, the user session, lingering, and where keys are", async () => {
  const file = async () => "a file only you can read";
  const ready = await linuxChecks(
    machine({ has: ["bwrap", "socat"], session: true, linger: true }),
    file,
  );
  expect(ready.map((c) => c.level)).toEqual(["ok", "ok", "info"]);
  expect(ready[2]?.what).toBe("Place keys kept in a file only you can read");

  const bare = await linuxChecks(machine({ has: ["bwrap"], session: true, linger: false }), file);
  expect(bare[0]).toMatchObject({ level: "fail", what: "Sandbox tools: socat missing" });
  expect(bare[1]).toMatchObject({ level: "warn", fix: "loginctl enable-linger $USER" });

  const container = await linuxChecks(machine({ has: [], session: false, linger: false }), file);
  expect(container[1]).toMatchObject({ level: "fail", what: "No systemd user session" });
});
