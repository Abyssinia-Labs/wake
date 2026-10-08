// What a running listener tells `wakectl status`: written by the listener,
// read by the command, never by the apps.
import { writeJson } from "./config";

export type RunState = {
  app: string;
  ref: string;
  sessionId: string;
  cwd: string;
  startedAt: number;
};

export type ListenerState = {
  pid: number;
  startedAt: number;
  updatedAt: number;
  apps: Record<string, { agent: string; connected: boolean; unpaired: boolean }>;
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
