// Runs in herdr (https://herdr.dev), for a person who wants to watch: each
// summons is a tab in a "Wake" workspace with an interactive Claude Code
// session in the run's worktree. herdr's sidebar shows it working, blocked
// on a question, or done, and the person can type into it at any time.
//
// Nothing from a ticket ever reaches a command line. The agent is started
// with plain arguments only (a session id, a name made of the ticket key, a
// settings file path); everything with words in it, Wake's rules and the
// app's prompt, is submitted with `herdr agent prompt`, which pastes into
// Claude Code's input, not into a shell.
import { chmod, lstat, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type ClaudeResult, type ClaudeRun, rules } from "./claude";
import { trustCodexFolder } from "./codex-trust";
import type { Exec } from "./exec";
import { claudeSettings } from "./fence";
import { promptUntilTurnEnds } from "./herdr-prompt";
import { branchListsMcps, cursorModeArgs, writeCursorPermissions } from "./runners/cursor";

const WORKSPACE = "Wake";
/** No spaces in it, unlike Application Support, so a path is one plain argument. */
const RUNS_DIR = join(homedir(), ".wake", "runs");

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** The first string found under any of `keys`, however deep: herdr nests results. */
export function findString(value: unknown, keys: readonly string[]): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findString(item, keys);
      if (found) return found;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;
  for (const key of keys) if (typeof value[key] === "string") return value[key] as string;
  for (const inner of Object.values(value)) {
    const found = findString(inner, keys);
    if (found) return found;
  }
  return undefined;
}

/** An agent name herdr accepts, `[a-z][a-z0-9_-]{0,31}`, from a ticket key. */
export function agentName(ref: string, salt: string): string {
  const base = `wake-${ref.toLowerCase().replace(/[^a-z0-9-]/g, "")}`.slice(0, 24);
  return `${base}-${salt.replace(/[^a-z0-9]/g, "").slice(0, 6)}`;
}

/** What is submitted into the session: the rules, then the app's prompt. */
export function openingPrompt(o: ClaudeRun): string {
  return `${rules({ ...o, live: true })}\n\n---\n\n${o.prompt}`;
}

/**
 * The agent's own arguments, per tool (GAT-68). Plain values only: a session
 * id, a sanitised name, a path, fixed flags. Claude Code gets its settings
 * file; Codex its sandbox with network on; Cursor reads the permissions file
 * Wake has written into the worktree, and is told the worktree is trusted:
 * every worktree is a folder it has not seen, and its trust question is one
 * herdr does not report as blocked, so a start waits out its timeout (GAT-31).
 */
export function nativeArgs(o: ClaudeRun, settings: string, approveMcps = true): string[] {
  switch (o.tool ?? "claude") {
    case "codex":
      return ["--sandbox", "workspace-write", "-c", "sandbox_workspace_write.network_access=true"];
    case "cursor":
      return [
        "--trust",
        "--sandbox",
        "enabled",
        ...(approveMcps ? ["--approve-mcps"] : []),
        ...cursorModeArgs(o),
      ];
    default: {
      const args = [
        "--session-id",
        o.sessionId,
        "--setting-sources",
        "user",
        "--settings",
        settings,
      ];
      if (o.name) args.push("--name", o.name.replace(/[^A-Za-z0-9·_-]/g, ""));
      return args;
    }
  }
}

async function herdr(run: Exec, args: string[]): Promise<unknown> {
  const result = await run(["herdr", ...args]);
  if (result.code !== 0) {
    const why = (result.stderr || result.stdout).trim().split("\n").at(-1) ?? "";
    throw new Error(`herdr ${args.slice(0, 2).join(" ")} failed${why ? `: ${why}` : ""}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return result.stdout;
  }
}

/** Whether a herdr server is up to take a tab; without one, the run goes headless. */
export async function herdrRunning(run: Exec): Promise<boolean> {
  try {
    const result = await run(["herdr", "status", "server", "--json"]);
    if (result.code !== 0) return false;
    // `herdr status server --json` says `"running": true|false` (0.9.3).
    const status: unknown = JSON.parse(result.stdout);
    return isRecord(status) && status.running === true;
  } catch {
    return false;
  }
}

async function wakeWorkspace(run: Exec, cwd: string): Promise<string> {
  // The workspace labelled Wake, if one is open; otherwise a new one.
  const match = findWorkspace(await herdr(run, ["workspace", "list"]));
  if (match) return match;
  const made = await herdr(run, [
    "workspace",
    "create",
    "--label",
    WORKSPACE,
    "--cwd",
    cwd,
    "--no-focus",
  ]);
  const id = findString(made, ["workspace_id"]);
  if (!id) throw new Error("herdr made a workspace but did not say its id.");
  return id;
}

export function findWorkspace(listed: unknown): string | undefined {
  const all: Record<string, unknown>[] = [];
  const collect = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (isRecord(value)) {
      if (typeof value.workspace_id === "string") all.push(value);
      Object.values(value).forEach(collect);
    }
  };
  collect(listed);
  const wake = all.find((one) => one.label === WORKSPACE || one.name === WORKSPACE);
  return typeof wake?.workspace_id === "string" ? wake.workspace_id : undefined;
}

/**
 * Whether `agent start` stopped on a question the agent asked before it was
 * ready. herdr says agent_not_ready when it recognises the question; when it
 * does not, it waits out the startup timeout, which reads the same way here.
 */
export function startBlocked(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message.includes("agent_not_ready") ||
      error.message.includes("timed out waiting for agent startup"))
  );
}

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
}

/** A ref as a tab's label: never starting with a dash, never empty. */
export function tabLabel(ref: string): string {
  return ref.replace(/^-+/, "").trim() || "Wake run";
}

export type HerdrRun = ClaudeRun & { ref: string };

export async function runInHerdr(o: HerdrRun, run: Exec): Promise<ClaudeResult> {
  await mkdir(RUNS_DIR, { recursive: true, mode: 0o700 });
  await chmod(RUNS_DIR, 0o700);
  const settings = join(RUNS_DIR, `${o.sessionId}.settings.json`);
  await writeFile(settings, JSON.stringify(claudeSettings(o), null, 2), { mode: 0o600 });

  const workspace = await wakeWorkspace(run, o.cwd);
  const tab = await herdr(run, [
    "tab",
    "create",
    "--workspace",
    workspace,
    "--cwd",
    o.cwd,
    // herdr takes the value as its own argument (it refuses `--label=…`,
    // which broke every herdr run, 2026-10-09), so a ref may not start
    // with a dash and be read as an option instead.
    "--label",
    tabLabel(o.ref),
    "--no-focus",
  ]);
  const pane = findString(tab, ["pane_id"]);
  if (!pane) throw new Error("herdr made a tab but did not say its pane.");

  const name = agentName(o.ref, o.sessionId);
  const tool = o.tool ?? "claude";
  let approveMcps = true;
  if (tool === "cursor") {
    await writeCursorPermissions(run, o);
    approveMcps = !(await branchListsMcps(o.cwd));
  }
  if (tool === "codex" && o.trustFolder) {
    // A trusted folder's own .codex/config.toml is loaded, and it can set
    // the sandbox and approvals: a branch that ships one is asked about.
    if (await exists(join(o.cwd, ".codex"))) {
      o.onEvent?.(
        "the branch has its own .codex settings, so Codex asks you to trust it in the tab",
      );
    } else if (await trustCodexFolder(o.cwd)) {
      o.onEvent?.("trusted the worktree in Codex's config (wakectl trust codex)");
    }
  }
  // A question before startup that was answered: the prompt waits a moment.
  let answered = false;
  try {
    await herdr(run, [
      "agent",
      "start",
      name,
      "--kind",
      tool,
      "--pane",
      pane,
      "--",
      ...nativeArgs(o, settings, approveMcps),
    ]);
    o.onEvent?.(`in herdr: workspace ${WORKSPACE}, tab ${o.ref}, agent ${name}`);
  } catch (error) {
    // A question before it is ready (Codex asks whether to trust a new folder,
    // and every worktree is one): the person is watching here, so wait for
    // their answer rather than fail the run (GAT-31, 2026-10-08).
    if (!startBlocked(error)) throw error;
    o.onEvent?.(
      `waiting for you in herdr: the ${o.ref} tab may be asking a question before it starts (whether to trust the folder, say)`,
    );
    const ready = await run([
      "herdr",
      "agent",
      "wait",
      name,
      "--until",
      "idle",
      "--timeout",
      String(o.timeoutMs),
    ]);
    if (ready.code !== 0) {
      const why = (ready.stderr || ready.stdout).trim().split("\n").at(-1) ?? "";
      return {
        ok: false,
        reason: why.includes("timeout")
          ? `The ${o.ref} tab in herdr was still asking a question when Wake stopped waiting.`
          : `herdr never saw ${o.tool ?? "claude"} ready in the ${o.ref} tab: ${why || "no reason given"}`,
      };
    }
    o.onEvent?.("answered; starting the work");
    answered = true;
  }

  return await promptUntilTurnEnds(run, {
    name,
    text: openingPrompt(o),
    timeoutMs: o.timeoutMs,
    settle: answered,
    ...(o.onEvent ? { onEvent: o.onEvent } : {}),
  });
}
