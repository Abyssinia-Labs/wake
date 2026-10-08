// How wakectl looks in a terminal: colour, marks, a spinner for anything that
// waits on the network or launchd. No dependency: a dozen ANSI codes.
//
// Colour follows the usual rules: off when NO_COLOR is set or the stream is
// not a terminal (a pipe, a file, launchd's log), on when FORCE_COLOR asks.
// The listener never uses this: its log is plain text, and `wakectl logs`
// colours it on the way out.

type Stream = { isTTY?: boolean; write: (text: string) => unknown };

export function colorOn(stream: Stream = process.stdout): boolean {
  const { NO_COLOR, FORCE_COLOR, TERM } = process.env;
  if (NO_COLOR !== undefined && NO_COLOR !== "") return false;
  if (FORCE_COLOR !== undefined && FORCE_COLOR !== "0") return true;
  return stream.isTTY === true && TERM !== "dumb";
}

function paint(open: number, close: number) {
  return (text: string): string => (colorOn() ? `\x1b[${open}m${text}\x1b[${close}m` : text);
}

export const bold = paint(1, 22);
export const dim = paint(2, 22);
export const red = paint(31, 39);
export const green = paint(32, 39);
export const yellow = paint(33, 39);
export const blue = paint(34, 39);
export const magenta = paint(35, 39);
export const cyan = paint(36, 39);

/** The marks a line starts with; each is still a different character without colour. */
export const mark = {
  ok: (): string => green("✓"),
  fail: (): string => red("✗"),
  warn: (): string => yellow("!"),
  on: (): string => green("●"),
  half: (): string => yellow("◐"),
  off: (): string => dim("○"),
  arrow: (): string => cyan("→"),
};

/** A path with the home folder as ~, as a person types it. */
export function tildify(path: string, home = process.env.HOME ?? ""): string {
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/** Pads to a visible width, ignoring the colour codes in it. */
export function pad(text: string, width: number): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI escapes is the point.
  const visible = text.replace(/\x1b\[[0-9;]*m/g, "").length;
  return text + " ".repeat(Math.max(0, width - visible));
}

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * Runs `work` with a spinner on stderr saying what it waits for, then a ✓ or
 * ✗ line in its place. Off a terminal it draws nothing while it waits; the
 * result line still comes, from `done`, or the error's own message.
 */
export async function spin<T>(
  text: string,
  work: () => Promise<T>,
  done?: (result: T) => string,
  stream: Stream = process.stderr,
): Promise<T> {
  const live = colorOn(stream);
  let frame = 0;
  const draw = (): void => {
    stream.write(`\r\x1b[2K${cyan(FRAMES[frame % FRAMES.length] ?? "")} ${text}`);
    frame += 1;
  };
  const timer = live ? setInterval(draw, 80) : undefined;
  if (live) draw();
  const clear = (): void => {
    if (timer) clearInterval(timer);
    if (live) stream.write("\r\x1b[2K");
  };
  try {
    const result = await work();
    clear();
    if (done) process.stdout.write(`${mark.ok()} ${done(result)}\n`);
    return result;
  } catch (error) {
    clear();
    process.stderr.write(`${mark.fail()} ${text}\n`);
    throw error;
  }
}

/** The command a person most likely meant, when what they typed is not one. */
export function closest(typed: string, choices: readonly string[]): string | undefined {
  const distance = (a: string, b: string): number => {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      let prev = row[0] ?? 0;
      row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const here = row[j] ?? 0;
        row[j] = Math.min(here + 1, (row[j - 1] ?? 0) + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = here;
      }
    }
    return row[b.length] ?? Number.POSITIVE_INFINITY;
  };
  let best: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const choice of choices) {
    const score = distance(typed, choice);
    if (score < bestScore) {
      best = choice;
      bestScore = score;
    }
  }
  return bestScore <= Math.max(2, Math.floor(typed.length / 3)) ? best : undefined;
}
