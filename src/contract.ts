// wake/v1, as the Wake pattern defines it (docs/product/wake-pattern.md in
// each app). Wake imports no app's code, so this file is the whole of what
// it knows about them: every answer arrives as `unknown` and is narrowed
// here before anything else reads it.
import { makeFunctionReference } from "convex/server";

export const CONTRACT = "wake/v1";

export type Discovery = { version: typeof CONTRACT; convexUrl: string; httpBase: string };
export type Agent = { id: string; name: string };
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

// Each takes the place key as an argument: it is the whole credential, and
// nobody signs in (the pattern's contract, as amended on 2026-10-08).
export const pendingRef = makeFunctionReference<"query", { key: string }, unknown>("wake:pending");
export const claimRef = makeFunctionReference<"mutation", { key: string; id: string }, unknown>(
  "wake:claim",
);
export const finishRef = makeFunctionReference<"mutation", Outcome & { key: string }, unknown>(
  "wake:finish",
);

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
  if (!isText(v.convexUrl) || !isText(v.httpBase)) throw new ContractError("discovery");
  return { version: CONTRACT, convexUrl: v.convexUrl, httpBase: v.httpBase };
}

export function asPaired(v: unknown): Paired {
  if (isRecord(v) && isText(v.placeKey) && isText(v.app) && isRecord(v.agent)) {
    const { id, name } = v.agent;
    if (isText(id) && isText(name))
      return { placeKey: v.placeKey, app: v.app, agent: { id, name } };
  }
  throw new ContractError("pairing");
}

function asSummons(v: unknown): Summons | null {
  if (!isRecord(v) || !isText(v.id) || !isText(v.app) || !isText(v.kind)) return null;
  if (typeof v.at !== "number" || !isRecord(v.target)) return null;
  const { kind, ref, url } = v.target;
  if (!isText(kind) || !isText(ref) || !isText(url)) return null;
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
  if (isRecord(v) && v.claimed === true && isRecord(v.run) && isText(v.run.prompt)) {
    return { claimed: true, run: { prompt: v.run.prompt } };
  }
  throw new ContractError("wake:claim");
}
