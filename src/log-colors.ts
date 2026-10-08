// `wakectl logs` in colour: the listener writes plain lines (a UTC stamp,
// then what happened), and this paints them on the way to a terminal, so the
// file itself stays plain for grep and for launchd.
import { bold, cyan, dim, green, magenta, red, yellow } from "./ui";

const STAMP = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) (.*)$/;
const STEP = /^([A-Z][A-Z0-9]*-\d+): (.*)$/;

function local(stamp: string): string {
  const at = new Date(stamp);
  return Number.isNaN(at.getTime()) ? stamp : at.toTimeString().slice(0, 8);
}

function message(text: string): string {
  const step = text.match(STEP);
  if (step?.[1] && step[2] !== undefined) {
    const said = step[2].startsWith("said: ");
    return `${magenta(step[1])} ${said ? step[2] : dim(step[2])}`;
  }
  if (/^Claimed /.test(text)) return cyan(text);
  if (/^Started /.test(text)) return bold(text);
  if (/^Finished .*: done\.$/.test(text)) return green(text);
  if (/^Finished .*: failed|Could not|refused|failed|error/i.test(text)) return red(text);
  if (/^Paused|^Stopping|not running/i.test(text)) return yellow(text);
  return text;
}

/** One log line, painted; anything that is not a stamped line passes through. */
export function colorLogLine(line: string): string {
  const match = line.match(STAMP);
  if (!match?.[1] || match[2] === undefined) return line;
  return `${dim(local(match[1]))} ${message(match[2])}`;
}
