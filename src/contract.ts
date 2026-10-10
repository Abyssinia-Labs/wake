// wake/v1, as the Wake pattern defines it (docs/product/wake-pattern.md in
// each app). Wake imports no app's code, so this file is the whole of what
// it knows about them: every answer arrives as `unknown` and is narrowed
// here before anything else reads it.
import { makeFunctionReference } from "convex/server";

export const CONTRACT = "wake/v1";

/** How Wake reaches an app's summonses (the spec's Discovery): Convex functions, or HTTP routes. */
export const TRANSPORTS = ["convex", "http"] as const;
export type Transport = (typeof TRANSPORTS)[number];
export type Discovery =
  | { version: typeof CONTRACT; transport: "convex"; convexUrl: string; httpBase: string }
  | { version: typeof CONTRACT; transport: "http"; httpBase: string };
/** The agent tools Wake can start; the pairing names which one paired (GAT-68). */
export const AGENT_TOOLS = ["claude", "codex", "cursor"] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];
export type Agent = { id: string; name: string; tool?: AgentTool };
export type Paired = { placeKey: string; app: string; agent: Agent };
export type Target = { kind: string; ref: string; url: string };
/** A summons carries no text (the pattern's second principle). */
export type Summons = {
  id: string;
  app: string;
  kind: string;
  target: Target;
  repo?: string;
  branch?: string;
  at: number;
};
export type Run = { prompt: string };
export type Claim = { claimed: true; run: Run } | { claimed: false };
export type Outcome = { id: string; outcome: "done" | "failed"; reason?: string };
/** What `wake:started` tells the app: the run's name, its tool, its session when known. */
export type RunReport = { name: string; tool: AgentTool; session?: string };

// Each takes the place key as an argument: it is the whole credential, and
// nobody signs in (the pattern's contract, as amended on 2026-10-08).
export const pendingRef = makeFunctionReference<"query", { key: string }, unknown>("wake:pending");
export const claimRef = makeFunctionReference<"mutation", { key: string; id: string }, unknown>(
  "wake:claim",
);
export const finishRef = makeFunctionReference<"mutation", Outcome & { key: string }, unknown>(
  "wake:finish",
);
/** Optional in wake/v1: an app that doesn't serve it hears of a run from the agent instead. */
export const startedRef = makeFunctionReference<
  "mutation",
  { key: string; id: string; run: RunReport },
  unknown
>("wake:started");

/** What a wake:* function throws for a key that no longer opens anything. */
export const UNPAIRED = "UNPAIRED";

export class ContractError extends Error {
  constructor(what: string, detail?: string) {
    super(`The app's answer for ${what} is not ${CONTRACT}${detail ? `: ${detail}` : "."}`);
    this.name = "ContractError";
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isText(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

// Every value from an app is bounded and has a known shape: each ends up in a
// path, a tool name, a command line, a log line or a terminal (the security
// pass, 2026-10-08).
/** An app's name: a folder name and an MCP server name, so nothing else. */
const APP = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Ids are the app's own (Convex ids today): short, no punctuation. */
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const KIND = /^[a-z][a-z_-]{0,31}$/;
/** Shown in a terminal: no control characters, no escapes. */
const LABEL = /^[^\p{Cc}\p{Cf}]{1,64}$/u;
const KEY = /^[\x21-\x7e]{16,512}$/;
/** The run's prompt is pasted into an agent: generous, but bounded. */
export const MAX_PROMPT = 64 * 1024;

export function isAppName(v: unknown): v is string {
  return typeof v === "string" && APP.test(v);
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** https, or http only for a dev server on this machine; anything else is refused. */
export function isAppUrl(v: unknown, schemes = ["https:"]): v is string {
  if (typeof v !== "string" || v.length > 2048) return false;
  try {
    const url = new URL(v);
    if (url.username || url.password) return false;
    return (
      schemes.includes(url.protocol) || (url.protocol === "http:" && LOCAL_HOST.test(url.hostname))
    );
  } catch {
    return false;
  }
}

// Both end up as arguments to git, so neither may look like an option or
// climb out of a folder.
// GitHub owners start with a letter or digit; names may start with a dot (.github).
const REPO = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.][A-Za-z0-9_.-]*$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function isRepo(v: unknown): v is string {
  return typeof v === "string" && REPO.test(v) && !v.includes("..");
}

export function isBranch(v: unknown): v is string {
  return (
    typeof v === "string" &&
    v.length <= 200 &&
    BRANCH.test(v) &&
    !v.includes("..") &&
    !v.includes("//") &&
    !v.endsWith("/") &&
    !v.endsWith(".lock")
  );
}

export function asDiscovery(v: unknown): Discovery {
  if (!isRecord(v)) throw new ContractError("discovery");
  if (v.version !== CONTRACT) {
    const theirs = typeof v.version === "string" ? v.version : "an unknown version";
    throw new ContractError("discovery", `it speaks ${theirs}; update Wake`);
  }
  const transport = v.transport ?? "convex";
  if (!TRANSPORTS.some((one) => one === transport)) {
    const named = typeof transport === "string" ? transport.slice(0, 40) : "an unknown one";
    throw new ContractError("discovery", `it is reached over ${named}; update Wake`);
  }
  // The pair code, the place key and every summons travel over these.
  if (!isAppUrl(v.httpBase)) throw new ContractError("discovery", "its URLs must be https");
  if (transport === "http") return { version: CONTRACT, transport: "http", httpBase: v.httpBase };
  if (!isAppUrl(v.convexUrl)) throw new ContractError("discovery", "its URLs must be https");
  return { version: CONTRACT, transport: "convex", convexUrl: v.convexUrl, httpBase: v.httpBase };
}

export function asPaired(v: unknown): Paired {
  if (isRecord(v) && isKey(v.placeKey) && isAppName(v.app) && isRecord(v.agent)) {
    const { id, name, tool } = v.agent;
    const known = AGENT_TOOLS.find((one) => one === tool);
    if (isId(id) && isLabel(name)) {
      return {
        placeKey: v.placeKey,
        app: v.app,
        agent: { id, name, ...(known ? { tool: known } : {}) },
      };
    }
  }
  throw new ContractError("pairing");
}

function isId(v: unknown): v is string {
  return typeof v === "string" && ID.test(v);
}
function isLabel(v: unknown): v is string {
  return typeof v === "string" && LABEL.test(v);
}
function isKey(v: unknown): v is string {
  return typeof v === "string" && KEY.test(v);
}
function isKind(v: unknown): v is string {
  return typeof v === "string" && KIND.test(v);
}

function asSummons(v: unknown): Summons | null {
  if (!isRecord(v) || !isId(v.id) || !isAppName(v.app) || !isKind(v.kind)) return null;
  if (typeof v.at !== "number" || !isRecord(v.target)) return null;
  const { kind, ref, url } = v.target;
  // The pattern leaves a ref's shape to the app (GAT-70, a page's title): a label.
  if (!isKind(kind) || !isLabel(ref) || !isAppUrl(url)) return null;
  const summons: Summons = {
    id: v.id,
    app: v.app,
    kind: v.kind,
    target: { kind, ref, url },
    at: v.at,
  };
  // A repository and a branch come as a pair or not at all.
  if (v.repo !== undefined || v.branch !== undefined) {
    if (!isRepo(v.repo) || !isBranch(v.branch)) return null;
    summons.repo = v.repo;
    summons.branch = v.branch;
  }
  return summons;
}

/** The valid summonses, and how many were not, so the listener can say so. */
export function asSummonses(v: unknown): { summonses: Summons[]; rejected: number } {
  if (!Array.isArray(v)) throw new ContractError("wake:pending");
  const summonses: Summons[] = [];
  for (const item of v) {
    const summons = asSummons(item);
    if (summons) summonses.push(summons);
  }
  return { summonses, rejected: v.length - summonses.length };
}

export function asClaim(v: unknown): Claim {
  if (isRecord(v) && v.claimed === false) return { claimed: false };
  if (
    isRecord(v) &&
    v.claimed === true &&
    isRecord(v.run) &&
    isText(v.run.prompt) &&
    v.run.prompt.length <= MAX_PROMPT
  ) {
    return { claimed: true, run: { prompt: v.run.prompt } };
  }
  throw new ContractError("wake:claim");
}
