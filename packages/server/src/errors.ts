// What the server half refuses, by a code the HTTP routes map to the spec's
// answers (`UNPAIRED` is 401 unpaired) and a host can branch on.

export type WakeErrorCode = "UNPAIRED" | "CODE_INVALID" | "INVALID_SUMMONS" | "INVALID_BODY";

export class WakeError extends Error {
  constructor(
    readonly code: WakeErrorCode,
    detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = "WakeError";
  }
}
