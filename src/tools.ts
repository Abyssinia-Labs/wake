// The agent tools Wake can start, and what differs between them that is not
// how a run is driven (that is runners/*): the program, whether it is here,
// and how a person picks a session back up. A pairing names its tool
// (GAT-68); an older pairing that did not is Claude Code, as it always was.
import type { PairedApp } from "./config";
import type { AgentTool } from "./contract";
import type { Exec } from "./exec";

export const TOOL_NAMES: Record<AgentTool, string> = {
  claude: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

const PROGRAMS: Record<AgentTool, string> = {
  claude: "claude",
  codex: "codex",
  cursor: "cursor-agent",
};

export function toolOf(app: Pick<PairedApp, "tool">): AgentTool {
  return app.tool ?? "claude";
}

export function programOf(tool: AgentTool): string {
  return PROGRAMS[tool];
}

/** Whether the tool's program is on the PATH Wake runs with. */
export async function toolInstalled(run: Exec, tool: AgentTool): Promise<boolean> {
  return (await run(["/usr/bin/which", programOf(tool)])).code === 0;
}

/** The line that opens a finished run's session again, from its folder. */
export function resumeLine(tool: AgentTool, sessionId: string): string {
  switch (tool) {
    case "codex":
      return `codex resume ${sessionId}`;
    case "cursor":
      return `cursor-agent --resume ${sessionId}`;
    default:
      return `claude --resume ${sessionId}`;
  }
}
