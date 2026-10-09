// `wakectl status`: whether the listener is running, what is paired and
// connected, what it is running now, and how runs are set up. The layout is
// `statusLines`, pure, so it is tested without a listener.
import { existsSync } from "node:fs";
import { type Config, loadConfig, paths } from "../config";
import { say } from "../log";
import { isAlive, type ListenerState, readState } from "../state";
import { resumeLine, TOOL_NAMES, toolOf } from "../tools";
import { ago, bold, cyan, dim, mark, pad, red, someOf, tildify, yellow } from "../ui";

export type StatusInput = {
  config: Config;
  /** The listener's state when it is running, else null. */
  state: ListenerState | null;
  paused: boolean;
  now: number;
};

export function statusLines({ config, state, paused, now }: StatusInput): string[] {
  const lines: string[] = [];
  lines.push(
    state
      ? `${bold("Wake")}  ${mark.on()} listening ${dim(`· pid ${state.pid} · up ${ago(state.startedAt, now)}`)}`
      : `${bold("Wake")}  ${mark.off()} not running ${dim("·")} ${cyan("wakectl install")} ${dim("to start it")}`,
  );
  if (paused) {
    lines.push(
      `      ${mark.warn()} ${yellow("paused")}: nothing new is claimed ${dim("·")} ${cyan("wakectl resume")}`,
    );
  }

  lines.push("", bold("Paired"));
  const apps = Object.entries(config.apps);
  if (apps.length === 0) {
    lines.push(
      `  ${dim("nothing yet: ask your agent to pair Wake, or")} ${cyan("wakectl pair <domain> <code>")}`,
    );
  }
  for (const [key, app] of apps) {
    const live = state?.apps[key];
    const [dot, words] = !live
      ? [mark.off(), dim("not connected")]
      : live.missing
        ? [
            mark.warn(),
            yellow(
              live.missing === "no tool"
                ? "no tool here runs it"
                : `${live.missing} isn't installed`,
            ),
          ]
        : live.unpaired
          ? [mark.fail(), red("refused, pair it again")]
          : live.connected
            ? [mark.on(), "listening"]
            : [mark.half(), yellow("connecting")];
    const known = toolOf(app);
    const tool = dim(known ? TOOL_NAMES[known] : "?");
    lines.push(
      `  ${dot} ${pad(bold(app.domain), 18)}${pad(app.agent.name, 18)}${pad(tool, 14)}${words}`,
    );
  }

  if (apps.length > 0) {
    lines.push("", bold("Repositories"));
    const approved = Object.entries(config.repos);
    if (approved.length === 0) {
      lines.push(
        `  ${mark.warn()} ${yellow("none approved")}: runs are refused ${dim("·")} ${cyan("wakectl repos allow <owner/name>")}`,
      );
    }
    for (const [domain, repos] of approved) {
      lines.push(`  ${pad(bold(domain), 18)}${someOf(repos, "repositories")}`);
    }
  }

  const runs = state?.runs ?? [];
  if (runs.length > 0) {
    lines.push("", bold("Running now"));
    for (const run of runs) {
      lines.push(
        `  ${mark.half()} ${pad(bold(run.ref), 10)}${pad(run.name ?? "", 16)}${pad(ago(run.startedAt, now), 10)}${dim(tildify(run.cwd))}`,
      );
      lines.push(
        run.sessionId
          ? `    ${dim("resume:")} ${cyan(resumeLine(run.tool ?? "claude", run.sessionId))}`
          : `    ${dim("starting…")}`,
      );
    }
  }

  const allowed = config.extraAllowedTools;
  lines.push(
    "",
    bold("Runs"),
    `  ${pad(dim("mode"), 14)}${config.run}`,
    `  ${pad(dim("permissions"), 14)}${config.permissionMode}`,
    `  ${pad(dim("also allowed"), 14)}${allowed.length > 0 ? allowed.join(", ") : dim("nothing beyond Wake's own")}`,
    `  ${pad(dim("clones in"), 14)}${config.roots.map((root) => tildify(root)).join(", ")}`,
  );
  return lines;
}

export async function status(): Promise<void> {
  const p = paths();
  const state = await readState(p.state);
  const lines = statusLines({
    config: await loadConfig(),
    state: state && isAlive(state.pid) ? state : null,
    paused: existsSync(p.paused),
    now: Date.now(),
  });
  say(lines.join("\n"));
}
