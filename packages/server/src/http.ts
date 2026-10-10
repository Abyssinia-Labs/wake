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

export function bearer(req: Request): string | null {
  const match = req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export async function bodyOf(req: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await req.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
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
  if (error instanceof WakeError && error.code === "INVALID_BODY") return invalidBody("JSON");
  throw error;
}
