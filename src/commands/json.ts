// `wakectl <command> --json`: status, repos, model, doctor, open and setup, read
// from the same places their terminal forms read, printed as JSON (json.ts).
// Only the forms that change nothing take it.
import { existsSync } from "node:fs";
import { loadConfig, paths } from "../config";
import { readHistory } from "../history";
import { doctorJson, historyJson, modelsJson, statusJson } from "../json";
import { sayJson } from "../log";
import { isAlive, readState } from "../state";
import { doctorChecks, setupNow } from "./doctor";

export const JSON_COMMANDS = ["status", "repos", "model", "doctor", "open", "setup"] as const;

export function takesJson(command: string): boolean {
  return (JSON_COMMANDS as readonly string[]).includes(command);
}

export async function printJson(command: string): Promise<void> {
  const p = paths();
  switch (command) {
    case "status": {
      const state = await readState(p.state);
      return sayJson(
        statusJson({
          config: await loadConfig(),
          state: state && isAlive(state.pid) ? state : null,
          paused: existsSync(p.paused),
        }),
      );
    }
    case "repos":
      return sayJson((await loadConfig()).repos);
    case "model":
      return sayJson(modelsJson(await loadConfig()));
    case "doctor": {
      const { machine, wake } = await doctorChecks();
      return sayJson(doctorJson(machine, wake));
    }
    case "open":
      return sayJson(historyJson(await readHistory(p.history)));
    case "setup":
      return sayJson(await setupNow());
    default:
      throw new Error(`--json goes with ${JSON_COMMANDS.join(", ")}.`);
  }
}
