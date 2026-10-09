// A failure's reason goes back to the app, which shows it on the ticket to
// everyone who can see it. Only a `Shareable` says why in its own words: it is
// written for that, with no paths, usernames or command output. Anything else
// is reported as a plain failure, and the detail stays in this machine's log
// (the security pass, 2026-10-08).

export class Shareable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "Shareable";
  }
}

export const PRIVATE_FAILURE = "Wake hit an error on this machine; `wakectl logs` there says what.";

/** The reason to send the app for an error a run threw. */
export function reasonFor(error: unknown): string {
  return error instanceof Shareable ? error.message : PRIVATE_FAILURE;
}
