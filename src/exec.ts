// Every process Wake starts goes through here, as an argument list and
// never a shell string, so nothing an app sends is ever parsed by a shell.

export type Result = { code: number; stdout: string; stderr: string };
export type Exec = (cmd: string[], options?: { cwd?: string }) => Promise<Result>;

export const exec: Exec = async (cmd, options) => {
  const proc = Bun.spawn(cmd, { cwd: options?.cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
};

export class CommandError extends Error {
  constructor(cmd: string[], result: Result) {
    const why = result.stderr.trim().split("\n").at(-1) ?? "";
    super(`${cmd.slice(0, 3).join(" ")} failed (${result.code})${why ? `: ${why}` : ""}`);
    this.name = "CommandError";
  }
}

/** git, with its output trimmed, throwing on a non-zero exit. */
export async function git(run: Exec, args: string[], cwd?: string): Promise<string> {
  const cmd = ["git", ...args];
  const result = await run(cmd, { cwd });
  if (result.code !== 0) throw new CommandError(cmd, result);
  return result.stdout.trim();
}

/** git, for a question whose answer is its exit code. */
export async function gitOk(run: Exec, args: string[], cwd?: string): Promise<boolean> {
  return (await run(["git", ...args], { cwd })).code === 0;
}
