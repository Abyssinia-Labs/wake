// What Linux needs beyond what a Mac has (WAK-6): bubblewrap and socat for
// Claude Code's sandbox, a systemd user session to keep the listener
// running, lingering so it outlives a logout, and where keys are kept.
import type { Check } from "./doctor";
import type { Exec } from "./exec";
import { keyStoreName } from "./secrets";
import { lingers } from "./systemd";

async function has(run: Exec, program: string): Promise<boolean> {
  return (await run(["/usr/bin/which", program])).code === 0;
}

export async function linuxChecks(
  run: Exec,
  keyStore: () => Promise<string> = keyStoreName,
): Promise<Check[]> {
  const checks: Check[] = [];
  const missing: string[] = [];
  for (const program of ["bwrap", "socat"]) if (!(await has(run, program))) missing.push(program);
  checks.push(
    missing.length === 0
      ? { level: "ok", what: "Sandbox tools: bubblewrap, socat" }
      : {
          level: "fail",
          what: `Sandbox tools: ${missing.join(", ")} missing`,
          detail:
            "Claude Code's sandbox needs bubblewrap and socat; without them its runs can't start.",
          fix: "sudo apt install bubblewrap socat",
        },
  );
  const session = await run(["systemctl", "--user", "show-environment"]);
  if (session.code !== 0) {
    checks.push({
      level: "fail",
      what: "No systemd user session",
      detail: "wakectl install keeps the listener running as a systemd user service.",
      fix: "Log in through a session with systemd, or run `wakectl listen` under your own supervisor.",
    });
  } else if (!(await lingers(run))) {
    checks.push({
      level: "warn",
      what: "Wake stops when you log out",
      detail: "Your user services run only while you're logged in.",
      fix: "loginctl enable-linger $USER",
    });
  } else {
    checks.push({ level: "ok", what: "Keeps running after you log out" });
  }
  checks.push({ level: "info", what: `Place keys kept in ${await keyStore()}` });
  return checks;
}
