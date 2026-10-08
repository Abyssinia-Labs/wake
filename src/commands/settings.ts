// How runs behave, from the command line: `wakectl mode`, `wakectl
// permissions` and `wakectl allow`. Each writes the config the listener reads
// on every run, so the next run uses it with no restart.
import {
  loadConfig,
  PERMISSION_MODES,
  type PermissionMode,
  RUN_MODES,
  type RunMode,
  saveConfig,
} from "../config";
import { say } from "../log";

/** `wakectl mode [headless|herdr]`: how runs start. */
export async function mode(next: string | undefined): Promise<void> {
  const config = await loadConfig();
  if (next === undefined) {
    say(`Runs are ${config.run}.`);
    return;
  }
  const chosen = RUN_MODES.find((one) => one === next) as RunMode | undefined;
  if (!chosen) throw new Error(`mode is one of ${RUN_MODES.join(", ")}`);
  await saveConfig({ ...config, run: chosen });
  say(
    chosen === "herdr"
      ? "Runs open as a tab in herdr's Wake workspace, where you can watch and step in. With herdr not running, they run headless."
      : "Runs are headless: `wakectl logs -f` follows them, and `claude --resume` opens one afterwards.",
  );
}

const MEANS: Record<PermissionMode, string> = {
  acceptEdits:
    "edits and the allowed tools go ahead; anything else asks. Headless, an ask is denied; in herdr it waits for you.",
  auto: "Claude Code's auto mode decides what is safe to run, so a run rarely waits on you.",
  dontAsk:
    "anything not allowed is denied rather than asked, so a run never waits. Widen it with `wakectl allow`.",
};

/** `wakectl permissions [acceptEdits|auto|dontAsk]`: Claude Code's permission mode for runs. */
export async function permissions(next: string | undefined): Promise<void> {
  const config = await loadConfig();
  if (next === undefined) {
    say(`Permissions: ${config.permissionMode}, ${MEANS[config.permissionMode]}`);
    return;
  }
  if (next === "bypassPermissions") {
    throw new Error(
      "bypassPermissions is not offered: a run starts from a comment, not from you at the keyboard, so it keeps a fence. Try auto.",
    );
  }
  const chosen = PERMISSION_MODES.find((one) => one === next);
  if (!chosen) throw new Error(`permissions is one of ${PERMISSION_MODES.join(", ")}`);
  await saveConfig({ ...config, permissionMode: chosen });
  say(`Permissions: ${chosen}, ${MEANS[chosen]}`);
}

/** `wakectl allow [rule] [--remove]`: tools a run may use beyond Wake's own list. */
export async function allow(rule: string | undefined, remove: boolean): Promise<void> {
  const config = await loadConfig();
  if (rule === undefined) {
    say(
      config.extraAllowedTools.length > 0
        ? `Also allowed: ${config.extraAllowedTools.join(", ")}`
        : "Nothing allowed beyond Wake's own list (edits, git, gh, bun, the app's tools).",
    );
    return;
  }
  const rest = config.extraAllowedTools.filter((one) => one !== rule);
  await saveConfig({ ...config, extraAllowedTools: remove ? rest : [...rest, rule] });
  say(remove ? `No longer allowed: ${rule}` : `Allowed for runs: ${rule}`);
}
