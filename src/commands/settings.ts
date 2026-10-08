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
import { bold, cyan, dim, mark } from "../ui";

/** `wakectl mode [headless|herdr]`: how runs start. */
export async function mode(next: string | undefined): Promise<void> {
  const config = await loadConfig();
  if (next === undefined) {
    say(
      `Runs are ${bold(config.run)}. ${dim(`Change with wakectl mode ${config.run === "herdr" ? "headless" : "herdr"}.`)}`,
    );
    return;
  }
  const chosen = RUN_MODES.find((one) => one === next) as RunMode | undefined;
  if (!chosen) throw new Error(`mode is one of ${RUN_MODES.join(", ")}`);
  await saveConfig({ ...config, run: chosen });
  say(`${mark.ok()} Runs are ${bold(chosen)}`);
  say(
    dim(
      chosen === "herdr"
        ? "  Each opens as a tab in herdr's Wake workspace, where you can watch and step in. With herdr not running, a run is headless."
        : "  wakectl logs -f follows them, and claude --resume opens one afterwards.",
    ),
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
    say(`Permissions are ${bold(config.permissionMode)}: ${dim(MEANS[config.permissionMode])}`);
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
  say(`${mark.ok()} Permissions are ${bold(chosen)}`);
  say(dim(`  ${MEANS[chosen]}`));
}

/** `wakectl allow [rule] [--remove]`: tools a run may use beyond Wake's own list. */
export async function allow(rule: string | undefined, remove: boolean): Promise<void> {
  const config = await loadConfig();
  if (rule === undefined) {
    say(
      config.extraAllowedTools.length > 0
        ? `Also allowed: ${config.extraAllowedTools.map((one) => cyan(one)).join(", ")}`
        : `Nothing beyond Wake's own list ${dim("(edits, git, gh, bun, the app's tools)")}`,
    );
    return;
  }
  const rest = config.extraAllowedTools.filter((one) => one !== rule);
  await saveConfig({ ...config, extraAllowedTools: remove ? rest : [...rest, rule] });
  say(
    remove
      ? `${mark.ok()} No longer allowed: ${cyan(rule)}`
      : `${mark.ok()} Allowed for runs: ${cyan(rule)}`,
  );
}

/** `wakectl trust codex [on|off]`: let a Codex run in herdr start without asking to trust its folder. */
export async function trust(tool: string | undefined, next: string | undefined): Promise<void> {
  if (tool !== "codex") throw new Error("usage: wakectl trust codex [on|off]");
  const config = await loadConfig();
  if (next === undefined) {
    say(
      config.trustCodexWorktrees
        ? `Codex worktrees are trusted ${dim("(an entry in ~/.codex/config.toml per run, removed by wakectl prune)")}`
        : `Codex worktrees are not trusted ${dim("(a Codex run in herdr asks first; answer it in the tab)")}`,
    );
    return;
  }
  if (next !== "on" && next !== "off") throw new Error("usage: wakectl trust codex [on|off]");
  await saveConfig({ ...config, trustCodexWorktrees: next === "on" });
  say(
    next === "on"
      ? `${mark.ok()} Codex worktrees are trusted\n${dim("  Each Codex run in herdr adds its worktree to ~/.codex/config.toml, marked as Wake's; wakectl prune takes it out.")}`
      : `${mark.ok()} Codex worktrees are not trusted ${dim("Entries already added stay until wakectl prune.")}`,
  );
}
