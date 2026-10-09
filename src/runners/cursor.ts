// A run in Cursor (`cursor-agent -p`), for an agent Cursor paired (GAT-68).
// Cursor reads permissions from a project file, so Wake writes the run's own
// into the worktree as .cursor/cli.json: the same tools Claude Code gets, the
// same fences, deny over allow. Only where the repository does not keep its
// own, and kept out of git. `auto` is Cursor's Auto-review (`--auto-review`):
// its classifier runs what it judges safe and asks about the rest, as Claude
// Code's auto mode does. The prompt is an argument, not a shell string: Bun
// hands it to cursor-agent as one argv entry.
import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type ClaudeResult, type ClaudeRun, rules, type Spawn, spawnClaude } from "../claude";
import { describeEvent, resultOf } from "../claude-events";
import { Shareable } from "../errors";
import type { Exec } from "../exec";
import { gitOk } from "../exec";
import { cursorPermissions } from "../fence";
import { excludeFromGit } from "../worktree";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

async function isLink(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isSymbolicLink();
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
  // The branch's own file would be Cursor's whole fence, and the branch is
  // the app's to name: refused, not deferred to (the security pass).
  if (tracked) {
    throw new Shareable(
      "The repository keeps its own .cursor/cli.json, which would replace Wake's limits for Cursor, so Wake won't start Cursor on it.",
    );
  }
  for (const path of [join(o.cwd, ".cursor"), file]) {
    if (await isLink(path)) {
      throw new Shareable(
        "The branch makes .cursor a link, so Wake won't write Cursor's limits there.",
      );
    }
  }
  // Written at every run, over whatever is there: an agent with Write(**)
  // could have widened the last run's file for the next one.
  await mkdir(join(o.cwd, ".cursor"), { recursive: true });
  // `permissions` only: a project file with any other key, `version` say, is
  // refused outright and cursor-agent exits before it starts (GAT-31).
  await Bun.write(file, JSON.stringify({ permissions: cursorPermissions(o) }, null, 2));
  if (o.defaultBranch) await excludeFromGit(run, o.cwd, "/.cursor/cli.json");
  return true;
}

/** Cursor's flags for the permission mode; acceptEdits and dontAsk are the file's allowlist alone. */
export function cursorModeArgs(o: Pick<ClaudeRun, "permissionMode">): string[] {
  return o.permissionMode === "auto" ? ["--auto-review"] : [];
}

/**
 * Whether the branch lists MCP servers of its own. `--approve-mcps` would
 * start them, and a stdio server is a command the branch chose, so a run
 * on such a branch approves none (the security pass). The person's own
 * servers, the app's among them, are theirs and stay approved otherwise.
 */
export async function branchListsMcps(cwd: string): Promise<boolean> {
  try {
    await lstat(join(cwd, ".cursor", "mcp.json"));
    return true;
  } catch {
    return false;
  }
}

export function cursorArgs(o: ClaudeRun, approveMcps = true): string[] {
  return [
    "cursor-agent",
    "-p",
    "--output-format",
    "stream-json",
    "--trust",
    // Commands off the allow list run sandboxed (fence.ts).
    "--sandbox",
    "enabled",
    ...(approveMcps ? ["--approve-mcps"] : []),
    ...cursorModeArgs(o),
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
  await writeCursorPermissions(run, o);
  let result: Record<string, unknown> | null = null;
  let session = false;
  const approve = !(await branchListsMcps(o.cwd));
  if (!approve) o.onEvent?.("the branch lists its own MCP servers; none are approved for this run");
  const done = await spawn(cursorArgs(o, approve), {
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
