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
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { allowedTools, type ClaudeResult, type ClaudeRun, disallowedTools, rules } from "./claude";
import type { Exec } from "./exec";

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

/** Claude Code settings carrying what `-p` gets as flags: edits accepted, the tool lists. */
export function claudeSettings(o: ClaudeRun): Record<string, unknown> {
  return {
    permissions: {
      defaultMode: "acceptEdits",
      allow: allowedTools(o),
      deny: disallowedTools(o.defaultBranch),
    },
  };
}

/** What is submitted into the session: the rules, then the app's prompt. */
export function openingPrompt(o: ClaudeRun): string {
  return `${rules({ ...o, live: true })}\n\n---\n\n${o.prompt}`;
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

export type HerdrRun = ClaudeRun & { ref: string };

export async function runInHerdr(o: HerdrRun, run: Exec): Promise<ClaudeResult> {
  await mkdir(RUNS_DIR, { recursive: true });
  const settings = join(RUNS_DIR, `${o.sessionId}.settings.json`);
  await Bun.write(settings, JSON.stringify(claudeSettings(o), null, 2));

  const workspace = await wakeWorkspace(run, o.cwd);
  const tab = await herdr(run, [
    "tab",
    "create",
    "--workspace",
    workspace,
    "--cwd",
    o.cwd,
    "--label",
    o.ref,
    "--no-focus",
  ]);
  const pane = findString(tab, ["pane_id"]);
  if (!pane) throw new Error("herdr made a tab but did not say its pane.");

  const name = agentName(o.ref, o.sessionId);
  const native = ["--session-id", o.sessionId, "--settings", settings];
  if (o.name) native.push("--name", o.name.replace(/[^A-Za-z0-9·_-]/g, ""));
  await herdr(run, ["agent", "start", name, "--kind", "claude", "--pane", pane, "--", ...native]);
  o.onEvent?.(`in herdr: workspace ${WORKSPACE}, tab ${o.ref}, agent ${name}`);

  // Submitted, then waited on until herdr says it is done; blocked keeps it
  // waiting for the person, which is the point of running here.
  const answer = await run([
    "herdr",
    "agent",
    "prompt",
    name,
    openingPrompt(o),
    "--wait",
    "--until",
    "done",
    "--timeout",
    String(o.timeoutMs),
  ]);
  if (answer.code === 0) {
    o.onEvent?.("done in herdr; the session stays open in its tab");
    return { ok: true };
  }
  const why = (answer.stderr || answer.stdout).trim().split("\n").at(-1) ?? "";
  return {
    ok: false,
    reason: why.includes("timeout")
      ? `Stopped waiting after ${Math.round(o.timeoutMs / 60_000)} minutes; it is still open in herdr.`
      : `herdr: ${why || "the agent's tab closed before it was done."}`,
  };
}
