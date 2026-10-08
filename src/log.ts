// The one place Wake writes to a terminal or to its log (CLAUDE.md).

export function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function warn(line: string): void {
  process.stderr.write(`${line}\n`);
}

/** A listener's line, timestamped, since launchd's log keeps no times. */
export function note(line: string): void {
  process.stdout.write(`${new Date().toISOString()} ${line}\n`);
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
