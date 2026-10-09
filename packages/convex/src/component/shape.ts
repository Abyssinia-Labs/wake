// What a summons may hold, word for word the spec's tables (docs/spec/
// wake-v1.md): Wake skips a summons that breaks one, so the component
// refuses to make it rather than let a host write rows nobody can run.
import { ConvexError } from "convex/values";

export const APP = /^[a-z0-9][a-z0-9-]{0,39}$/;
const KIND = /^[a-z][a-z_-]{0,31}$/;
const LABEL = /^[^\p{Cc}\p{Cf}]{1,64}$/u;
const REPO = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.][A-Za-z0-9_.-]*$/;
const BRANCH = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
export const MAX_PROMPT = 64 * 1024;

function isUrl(text: string): boolean {
  if (text.length > 2048) return false;
  try {
    const url = new URL(text);
    if (url.username || url.password) return false;
    return url.protocol === "https:" || (url.protocol === "http:" && LOCAL.test(url.hostname));
  } catch {
    return false;
  }
}

export function isBranch(text: string): boolean {
  return (
    text.length <= 200 &&
    BRANCH.test(text) &&
    !text.includes("..") &&
    !text.includes("//") &&
    !text.endsWith("/") &&
    !text.endsWith(".lock")
  );
}

export type SummonsShape = {
  kind: string;
  target: { kind: string; ref: string; url: string };
  repo?: string;
  branch?: string;
  prompt: string;
};

/** Throws `ConvexError("INVALID_SUMMONS: <field>")` for the first field the spec refuses. */
export function checkSummons(s: SummonsShape): void {
  const bad = (field: string): never => {
    throw new ConvexError(`INVALID_SUMMONS: ${field}`);
  };
  if (!KIND.test(s.kind)) bad("kind");
  if (!KIND.test(s.target.kind)) bad("target.kind");
  if (!LABEL.test(s.target.ref)) bad("target.ref");
  if (!isUrl(s.target.url)) bad("target.url");
  if ((s.repo === undefined) !== (s.branch === undefined)) bad("repo and branch come together");
  if (s.repo !== undefined && (!REPO.test(s.repo) || s.repo.includes(".."))) bad("repo");
  if (s.branch !== undefined && !isBranch(s.branch)) bad("branch");
  if (s.prompt.trim() === "" || s.prompt.length > MAX_PROMPT) bad("prompt");
}

const RUN_NAME = /^[a-z]{1,16}-[a-z]{1,16}$/;
const SESSION = /^[A-Za-z0-9_-]{1,128}$/;

/** `wake:started`'s rules: a call that breaks one is ignored, not stored. */
export function isRunReport(r: { name: string; session?: string }): boolean {
  return RUN_NAME.test(r.name) && (r.session === undefined || SESSION.test(r.session));
}
