// What a summons may hold, word for word the spec's tables (docs/spec/
// wake-v1.md), as the Convex component keeps them (its shape.ts): Wake
// skips a summons that breaks one, so it is refused when it is made rather
// than written as a row nobody can run.
import { WakeError } from "./errors";

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
  askerName?: string;
  kind: string;
  target: { kind: string; ref: string; url: string };
  repo?: string;
  branch?: string;
  prompt: string;
};

/** Throws `WakeError("INVALID_SUMMONS")` naming the first field the spec refuses. */
export function checkSummons(s: SummonsShape): void {
  const bad = (field: string): never => {
    throw new WakeError("INVALID_SUMMONS", field);
  };
  if (s.askerName !== undefined && !LABEL.test(s.askerName)) bad("askerName");
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

// The watch calls (the spec's "Devices that watch"): what a device may send.
// A call that breaks a rule is an invalid body; nothing of it is kept.

/** What a device is, for its owner's list: it watches and answers, and never claims. */
export const PLATFORMS = ["ios", "darwin", "web"] as const;
/** A device's name: shown in the app's list of them, so no control characters. */
const NAME = /^[^\p{Cc}\p{Cf}]{1,100}$/u;

/**
 * A machine's name as a device shows it (`wake:runs`, `wake:places`). Wake
 * pairs with the host's own name for itself, so a control character is
 * taken out rather than refused; empty after that, it is "A machine".
 */
export function cleanName(text: string): string {
  return text.replace(/[\p{Cc}\p{Cf}]/gu, "").trim() || "A machine";
}

/** `POST /wake/v1/watch`'s `device`. */
export function isDevice(d: { name: string; platform: string }): boolean {
  return NAME.test(d.name) && PLATFORMS.some((one) => one === d.platform);
}

/** What a watch call answers, or throws, where the agent's plan has no devices. */
export const NOT_IN_PLAN = "not-in-plan";
/** `wake:watching`'s `devices` and `alerts`: what the host's plan for an agent includes. */
export type Inclusion = "included" | typeof NOT_IN_PLAN;

export const ALERT_KINDS = ["ask", "waiting", "started", "done", "failed"] as const;
const PUSH_TOKEN = /^[0-9A-Fa-f]{16,512}$/;
const BASE64URL = /^[A-Za-z0-9_-]{16,256}$/;

export type PushShape = {
  kinds: string[];
  apns?: { token: string; environment: string };
  liveActivity?: { pushToStartToken: string };
  webPush?: { endpoint: string; keys: { p256dh: string; auth: string } };
};

/** An APNs token, a Live Activity's start token or its own (`wake:activity`): hex. */
export function isPushToken(text: string): boolean {
  return PUSH_TOKEN.test(text);
}

// The host's server posts to it, so https only, with no exception for this
// machine as a summons's URL has.
function isWebPush(w: NonNullable<PushShape["webPush"]>): boolean {
  if (!BASE64URL.test(w.keys.p256dh) || !BASE64URL.test(w.keys.auth)) return false;
  if (w.endpoint.length > 2048) return false;
  try {
    const url = new URL(w.endpoint);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

/** `wake:push`'s rules for a device on `platform`: one way to reach it, the one its platform has. */
export function isPush(p: PushShape, platform: string): boolean {
  const known = p.kinds.every((kind) => ALERT_KINDS.some((one) => one === kind));
  if (!known || new Set(p.kinds).size !== p.kinds.length) return false;
  if (platform === "web") {
    return !p.apns && !p.liveActivity && p.webPush !== undefined && isWebPush(p.webPush);
  }
  if (platform !== "ios" && platform !== "darwin") return false;
  if (p.webPush || !p.apns || !isPushToken(p.apns.token)) return false;
  if (p.apns.environment !== "production" && p.apns.environment !== "development") return false;
  return !p.liveActivity || isPushToken(p.liveActivity.pushToStartToken);
}
