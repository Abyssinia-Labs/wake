// The runs this machine made, by name (run-name.ts), so `wakectl open
// amber-heron` finds a run's folder, tool and session after it ends. The
// app shows the name; the folder stays here (the security pass: paths never
// go to the app). The last 200 are kept.
import { readFile } from "node:fs/promises";
import { writeJson } from "./config";
import { AGENT_TOOLS, type AgentTool } from "./contract";

export type RunRecord = {
  name: string;
  /** The summons's id, which tells two runs that happen to share a name apart. */
  summons: string;
  app: string;
  ref: string;
  tool: AgentTool;
  /** Empty until a tool that picks its own has said it. */
  sessionId: string;
  cwd: string;
  startedAt: number;
  finishedAt?: number;
  outcome?: "done" | "failed";
};

const KEEP = 200;

function isRecord(v: unknown): v is RunRecord {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.name === "string" &&
    typeof r.summons === "string" &&
    typeof r.app === "string" &&
    typeof r.ref === "string" &&
    AGENT_TOOLS.some((tool) => tool === r.tool) &&
    typeof r.sessionId === "string" &&
    typeof r.cwd === "string" &&
    typeof r.startedAt === "number"
  );
}

export async function readHistory(path: string): Promise<RunRecord[]> {
  try {
    const raw: unknown = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(raw) ? raw.filter(isRecord) : [];
  } catch {
    return [];
  }
}

/** Adds the run, or merges into the one already kept for the same summons and start. */
export async function recordRun(path: string, run: RunRecord): Promise<void> {
  const all = await readHistory(path);
  const at = all.findIndex((one) => one.summons === run.summons && one.startedAt === run.startedAt);
  if (at === -1) all.push(run);
  else all[at] = { ...all[at], ...run };
  await writeJson(path, all.slice(-KEEP));
}

/** The latest run with that name, or with that session id. */
export function findRun(all: readonly RunRecord[], wanted: string): RunRecord | undefined {
  const key = wanted.trim().toLowerCase();
  return [...all]
    .reverse()
    .find(
      (one) => one.name === key || (one.sessionId !== "" && one.sessionId.toLowerCase() === key),
    );
}
