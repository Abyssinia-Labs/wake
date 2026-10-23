// Small pieces the routes share: JSON answers, the spec's error bodies,
// the bearer key, a body read as `unknown` and narrowed before use.
import { WakeError } from "./errors";

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function refuse(status: number, error: string, message: string): Response {
  return json(status, { error, message });
}

export const unpaired = (): Response =>
  refuse(401, "unpaired", "This place key opens nothing: it was forgotten, or its agent revoked.");

export const invalidBody = (shape: string): Response =>
  refuse(400, "invalid_body", `Send ${shape}.`);

export const noContent = (): Response => new Response(null, { status: 204 });

/** A value of a body, read as an object or nothing. */
export function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function bearer(req: Request): string | null {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  try {
    return record(await req.json()) ?? {};
  } catch {
    return {};
  }
}

export function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() !== "" && value.length <= max
    ? value.trim()
    : null;
}

/** A refusal the spec names becomes its answer; anything else is the host's to see. */
export function answerFor(error: unknown): Response {
  if (error instanceof WakeError && error.code === "UNPAIRED") return unpaired();
  if (error instanceof WakeError && error.code === "INVALID_BODY") {
    return invalidBody("what the spec allows");
  }
  if (error instanceof WakeError && error.code === "NOT_IN_PLAN") {
    return refuse(402, "not-in-plan", "The agent's plan doesn't include devices.");
  }
  throw error;
}
