// The one place Wake writes to a terminal or to its log (CLAUDE.md).

export function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

export function warn(line: string): void {
  process.stderr.write(`${line}\n`);
}

/**
 * Control characters out, so text from an app or an agent can neither forge a
 * log line (a newline and a timestamp) nor send a terminal escape to whoever
 * reads it with `wakectl logs`.
 */
export function plain(line: string): string {
  return line.replace(/[\p{Cc}\p{Cf}]/gu, (c) => (c === "\t" ? c : "\uFFFD"));
}

/** A listener's line, timestamped, since launchd's log keeps no times. */
export function note(line: string): void {
  process.stdout.write(`${new Date().toISOString()} ${plain(line)}\n`);
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
