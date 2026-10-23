// What a running listener tells `wakectl status`: written by the listener,
// read by the command, never by the apps.
import { writeJson } from "./config";
import type { AgentTool } from "./contract";
import type { Waiting } from "./herdr-waiting";

export type RunState = {
  app: string;
  ref: string;
  sessionId: string;
  cwd: string;
  startedAt: number;
  /** Which tool runs it, for the resume line; Claude Code in an older state file. */
  tool?: AgentTool;
  /** Its two-word name (run-name.ts); absent in an older state file. */
  name?: string;
  /** The summons it runs, so `wakectl stop` can name it; absent in an older state file. */
  summons?: string;
  /** Since when a run in herdr waits on its owner, and the question; absent while it works. */
  waiting?: Waiting;
};

export type ListenerState = {
  pid: number;
  startedAt: number;
  updatedAt: number;
  /** Keyed like the config's apps: by domain, or domain and agent (pair.ts). */
  apps: Record<
    string,
    {
      agent: string;
      connected: boolean;
      unpaired: boolean;
      /** The tool's program, when it is not installed and nothing is claimed for it. */
      missing?: string;
    }
  >;
  runs: RunState[];
};

export async function writeState(path: string, state: ListenerState): Promise<void> {
  await writeJson(path, state);
}

export async function readState(path: string): Promise<ListenerState | null> {
  const file = Bun.file(path);
  if (!(await file.exists())) return null;
  const raw: unknown = await file.json();
  return typeof raw === "object" && raw !== null && "pid" in raw ? (raw as ListenerState) : null;
}

/** Whether the process that wrote the state is still running. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
