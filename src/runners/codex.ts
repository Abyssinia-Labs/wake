// A run in Codex (`codex exec`), for an agent Codex paired (GAT-68). Codex
// has no command deny-list, so its fence is its sandbox: workspace-write, the
// worktree and nothing outside it, with network on so it can push its branch
// and open a pull request. The rules ride at the head of the prompt, read
// from stdin, since Codex takes no appended system prompt on the command line.
import { type ClaudeResult, type ClaudeRun, rules, type Spawn, spawnClaude } from "../claude";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function codexArgs(o: ClaudeRun): string[] {
  return [
    "codex",
    "exec",
    "--json",
    "--cd",
    o.cwd,
    "--sandbox",
    "workspace-write",
    "-c",
    "sandbox_workspace_write.network_access=true",
    // A room is not a git repository, and that is fine for it.
    "--skip-git-repo-check",
    // auto: Codex's own review decides; the others never ask, exec has no one to ask.
    ...(o.permissionMode === "auto" ? ["--approve-for-me"] : []),
    "-",
  ];
}

export function codexPrompt(o: ClaudeRun): string {
  return `${rules({ ...o, tool: "codex" })}\n\n---\n\n${o.prompt}`;
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** One `codex exec --json` line as a log line, or null. */
export function describeCodexEvent(line: string): string | null {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(event)) return null;
  if (event.type === "thread.started") return "began";
  if (event.type === "turn.completed") return "finished";
  if (event.type === "turn.failed") return "stopped with an error";
  if (event.type !== "item.completed" || !isRecord(event.item)) return null;
  const item = event.item;
  switch (item.type) {
    case "agent_message":
      return typeof item.text === "string" ? `said: ${oneLine(item.text, 140)}` : null;
    case "command_execution":
      return typeof item.command === "string"
        ? `command: ${oneLine(item.command, 100)}`
        : "command";
    case "mcp_tool_call":
      return typeof item.tool === "string" ? `${item.tool}` : "tool call";
    case "file_change":
      return "edited files";
    default:
      return null;
  }
}

export async function runCodex(o: ClaudeRun, spawn: Spawn = spawnClaude): Promise<ClaudeResult> {
  let failure: string | null = null;
  let finished = false;
  const done = await spawn(codexArgs(o), {
    cwd: o.cwd,
    stdin: codexPrompt(o),
    timeoutMs: o.timeoutMs,
    onLine: (line) => {
      try {
        const event: unknown = JSON.parse(line);
        if (isRecord(event)) {
          if (event.type === "thread.started" && typeof event.thread_id === "string") {
            o.onSession?.(event.thread_id);
          }
          if (event.type === "turn.completed") finished = true;
          if (event.type === "turn.failed") {
            const error = isRecord(event.error) ? event.error.message : undefined;
            failure = typeof error === "string" ? error : "Codex stopped with an error.";
          }
        }
      } catch {
        // Not a JSON line: Codex said something else on stdout; nothing to read.
      }
      const said = describeCodexEvent(line);
      if (said) o.onEvent?.(said);
    },
  });
  if (done.timedOut) {
    return { ok: false, reason: `Stopped after ${Math.round(o.timeoutMs / 60_000)} minutes.` };
  }
  if (failure) return { ok: false, reason: String(failure).slice(0, 300) };
  if (done.code !== 0 || !finished) return { ok: false, reason: `codex exited ${done.code}.` };
  return { ok: true };
}
