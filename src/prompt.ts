// The few questions `wakectl setup` asks, as plain numbered lists: they work
// in any terminal, read well in a screen reader, and need no dependency. The
// terminal sits behind `Io`, so a whole setup is tested with a script of
// answers.
import { createInterface } from "node:readline/promises";
import { say } from "./log";
import { bold, cyan, dim } from "./ui";

export type Io = { ask(question: string): Promise<string>; say(line: string): void; close(): void };

export function terminalIo(): Io {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return { ask: (question) => rl.question(question), say, close: () => rl.close() };
}

export type Option<T extends string> = { value: T; label: string; hint?: string };

function list<T extends string>(
  io: Io,
  options: Option<T>[],
  marked: (i: number) => boolean,
): void {
  options.forEach((option, i) => {
    const hint = option.hint ? ` ${dim(option.hint)}` : "";
    io.say(`  ${marked(i) ? cyan("›") : " "} ${i + 1}. ${option.label}${hint}`);
  });
}

export async function confirm(io: Io, question: string, yes = true): Promise<boolean> {
  for (;;) {
    const answer = (await io.ask(`${bold(question)} ${dim(yes ? "[Y/n]" : "[y/N]")} `))
      .trim()
      .toLowerCase();
    if (answer === "") return yes;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
  }
}

/** One of `options`; Enter takes the marked one. */
export async function choose<T extends string>(
  io: Io,
  question: string,
  options: Option<T>[],
  initial = 0,
): Promise<T> {
  io.say(bold(question));
  list(io, options, (i) => i === initial);
  for (;;) {
    const answer = (await io.ask(dim(`  1-${options.length}, Enter for ${initial + 1}: `))).trim();
    const n = answer === "" ? initial + 1 : Number(answer);
    const picked = options[n - 1];
    if (Number.isInteger(n) && picked) return picked.value;
  }
}

/** Any of `options`: numbers like `1 3`, `all`, `none`, or Enter for the marked ones. */
export async function chooseMany<T extends string>(
  io: Io,
  question: string,
  options: Option<T>[],
  marked: readonly T[],
): Promise<T[]> {
  io.say(bold(question));
  list(io, options, (i) => marked.includes((options[i] as Option<T>).value));
  for (;;) {
    const answer = (
      await io.ask(dim("  numbers (1 3), all, none, or Enter to keep the marked ones: "))
    )
      .trim()
      .toLowerCase();
    if (answer === "") return [...marked];
    if (answer === "all") return options.map((option) => option.value);
    if (answer === "none") return [];
    const picks = answer.split(/[\s,]+/).map(Number);
    const chosen = picks.map((n) => options[n - 1]?.value);
    if (chosen.every((value): value is T => value !== undefined)) return [...new Set(chosen)];
  }
}

export async function text(io: Io, question: string): Promise<string> {
  return (await io.ask(`${bold(question)} `)).trim();
}
