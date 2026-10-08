// A run in Cursor (`cursor-agent -p`), for an agent Cursor paired (GAT-68).
// Cursor reads permissions from a project file, so Wake writes the run's own
// into the worktree as .cursor/cli.json: the same tools Claude Code gets, the
// same fences, deny over allow. Only where the repository does not keep its
// own, and kept out of git. Cursor has no auto mode; `auto` runs as
// acceptEdits and the log says so. The prompt is an argument, not a shell
// string: Bun hands it to cursor-agent as one argv entry.
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type ClaudeResult, type ClaudeRun, rules, type Spawn, spawnClaude } from "../claude";
import { describeEvent, resultOf } from "../claude-events";
import type { Exec } from "../exec";
import { gitOk } from "../exec";
import { excludeFromGit } from "../worktree";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `Bash(npm test:*)`, as `wakectl allow` keeps it, in Cursor's spelling. */
export function asCursorRule(rule: string): string | null {
  // Cursor matches the command's first word, then its arguments after a colon:
  // Bash(npm test:*) allows `npm test …` and is Shell(npm:test*), not all of npm.
  const bash = rule.match(/^Bash\(([^\s:()]+)((?:\s+[^:()]+)?)(?::\*)?\)$/);
  if (bash?.[1]) {
    const rest = (bash[2] ?? "").trim();
    return rest ? `Shell(${bash[1]}:${rest}*)` : `Shell(${bash[1]})`;
  }
  return /^(Shell|Read|Write|Mcp|WebFetch)\(.+\)$/.test(rule) ? rule : null;
}

export function cursorPermissions(o: ClaudeRun): { allow: string[]; deny: string[] } {
  const own = `Mcp(${o.mcpServer}:*)`;
  if (!o.defaultBranch) return { allow: [own], deny: ["Shell(*)", "Write(**)"] };
  const extra = o.extraAllowedTools.map(asCursorRule).filter((one): one is string => one !== null);
  return {
    allow: [
      "Read(**)",
      "Write(**)",
      "Shell(git)",
      "Shell(gh)",
      "Shell(bun)",
      "Shell(bunx)",
      own,
      ...extra,
    ],
    deny: [
      "Shell(gh:pr merge*)",
      "Shell(git:push --force*)",
      "Shell(git:push -f*)",
      "Shell(git:push --force-with-lease*)",
      `Shell(git:push origin ${o.defaultBranch}*)`,
      `Shell(git:push origin HEAD:${o.defaultBranch}*)`,
      `Shell(git:push -u origin ${o.defaultBranch}*)`,
    ],
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Writes the run's permissions where Cursor reads them, unless the repository keeps its own. */
export async function writeCursorPermissions(run: Exec, o: ClaudeRun): Promise<boolean> {
  const file = join(o.cwd, ".cursor", "cli.json");
  const tracked =
    o.defaultBranch !== undefined &&
    (await gitOk(run, ["ls-files", "--error-unmatch", ".cursor/cli.json"], o.cwd));
  if (tracked) {
    o.onEvent?.(
      "the repository keeps its own .cursor/cli.json; Wake's permissions are not written",
    );
    return false;
  }
  if (await exists(file)) return false;
  await mkdir(join(o.cwd, ".cursor"), { recursive: true });
  await Bun.write(file, JSON.stringify({ version: 1, permissions: cursorPermissions(o) }, null, 2));
  if (o.defaultBranch) await excludeFromGit(run, o.cwd, "/.cursor/cli.json");
  return true;
}

export function cursorArgs(o: ClaudeRun): string[] {
  return [
    "cursor-agent",
    "-p",
    "--output-format",
    "stream-json",
    "--trust",
    "--approve-mcps",
    "--workspace",
    o.cwd,
    `${rules({ ...o, tool: "cursor" })}\n\n---\n\n${o.prompt}`,
  ];
}

/** A Cursor stream line as a log line: its tool calls, then what it shares with Claude Code's. */
export function describeCursorEvent(line: string): string | null {
  try {
    const event: unknown = JSON.parse(line);
    if (isRecord(event) && event.type === "tool_call") {
      if (event.subtype !== "started" || !isRecord(event.tool_call)) return null;
      const [kind, call] = Object.entries(event.tool_call)[0] ?? [];
      const args = isRecord(call) && isRecord(call.args) ? call.args : {};
      const what = [args.command, args.path, args.name, args.toolName].find(
        (one): one is string => typeof one === "string",
      );
      const tool = (kind ?? "tool").replace(/ToolCall$/, "");
      return what ? `${tool}: ${what.replace(/\s+/g, " ").slice(0, 100)}` : tool;
    }
  } catch {
    return null;
  }
  return describeEvent(line);
}

export async function runCursor(
  o: ClaudeRun,
  run: Exec,
  spawn: Spawn = spawnClaude,
): Promise<ClaudeResult> {
  if (o.permissionMode === "auto") o.onEvent?.("Cursor has no auto mode; this run is acceptEdits");
  await writeCursorPermissions(run, o);
  let result: Record<string, unknown> | null = null;
  let session = false;
  const done = await spawn(cursorArgs(o), {
    cwd: o.cwd,
    stdin: "",
    timeoutMs: o.timeoutMs,
    onLine: (line) => {
      result = resultOf(line) ?? result;
      if (!session) {
        try {
          const event: unknown = JSON.parse(line);
          if (isRecord(event) && typeof event.session_id === "string") {
            session = true;
            o.onSession?.(event.session_id);
          }
        } catch {
          // Not JSON; nothing to read.
        }
      }
      const said = describeCursorEvent(line);
      if (said) o.onEvent?.(said);
    },
  });
  if (done.timedOut) {
    return { ok: false, reason: `Stopped after ${Math.round(o.timeoutMs / 60_000)} minutes.` };
  }
  const final = result as Record<string, unknown> | null;
  const text = typeof final?.result === "string" ? final.result : "";
  if (final?.is_error === true || done.code !== 0) {
    return { ok: false, reason: text.slice(0, 300) || `cursor-agent exited ${done.code}.` };
  }
  return { ok: true };
}
