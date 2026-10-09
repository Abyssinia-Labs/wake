// The HTTP half of wake/v1: discovery, pairing and forgetting. The place
// key travels as a bearer token, never in a URL.
import { asDiscovery, asPaired, type Discovery, type Paired } from "./contract";
import { messageOf } from "./log";

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;
export type Machine = { name: string; platform: string };

export class HttpError extends Error {
  constructor(
    readonly status: number,
    what: string,
    readonly code?: string,
  ) {
    super(`${what} answered ${status}${code ? ` (${code})` : ""}.`);
    this.name = "HttpError";
  }
}

/** The app no longer knows this place: it was forgotten, or its agent stopped. */
export function isUnpaired(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 401 || error.status === 403);
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

/** https for an app's domain; http only for a dev server on this machine. */
export function appOrigin(domain: string): string {
  const trimmed = domain.trim().replace(/\/+$/, "");
  if (trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("http://")) {
    // The pair code and the place key would cross the network in the clear.
    if (LOCAL.test(trimmed.slice("http://".length))) return trimmed;
    throw new Error(`Wake pairs over https only; http is for a dev server on this machine.`);
  }
  return LOCAL.test(trimmed) ? `http://${trimmed}` : `https://${trimmed}`;
}

async function errorCode(res: Response): Promise<string | undefined> {
  try {
    const body: unknown = await res.json();
    if (typeof body === "object" && body !== null && "error" in body) {
      const { error } = body;
      if (typeof error === "string") return error;
    }
  } catch {
    // A body that is not JSON has no code to report; the status still is.
  }
  return undefined;
}

async function call(
  fetcher: Fetch,
  url: string,
  what: string,
  init: RequestInit,
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetcher(url, { ...init, redirect: "error" });
  } catch (error) {
    throw new Error(`Could not reach ${new URL(url).origin}: ${messageOf(error)}`);
  }
  if (!res.ok) throw new HttpError(res.status, what, await errorCode(res));
  return res.status === 204 ? null : res.json();
}

function post(key: string | null, body?: unknown): RequestInit {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;
  return { method: "POST", headers, body: JSON.stringify(body ?? {}) };
}

export async function discover(domain: string, fetcher: Fetch = fetch): Promise<Discovery> {
  const url = `${appOrigin(domain)}/.well-known/wake`;
  return asDiscovery(await call(fetcher, url, url, { method: "GET" }));
}

export async function pairPlace(
  d: Discovery,
  code: string,
  machine: Machine,
  fetcher: Fetch = fetch,
): Promise<Paired> {
  const url = `${d.httpBase}/wake/v1/pair`;
  return asPaired(await call(fetcher, url, "Pairing", post(null, { code, machine })));
}

export async function forgetPlace(
  d: Pick<Discovery, "httpBase">,
  key: string,
  fetcher: Fetch = fetch,
): Promise<void> {
  await call(fetcher, `${d.httpBase}/wake/v1/forget`, "The forget route", post(key));
}
