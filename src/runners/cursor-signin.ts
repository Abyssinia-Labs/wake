// Whether Cursor is signed in to the app's MCP server where a run will start
// (WAK-14). Cursor keeps MCP sign-ins per folder (~/.cursor/projects/<folder>/
// mcp-auth.json), not per person; a folder doesn't inherit its parent's, and
// nothing supported shares one between folders. Each new branch is a new
// worktree, so a run there would start signed out and couldn't read what it
// was asked. Wake asks `cursor-agent mcp list` in the run's folder first and
// refuses a run that couldn't reach the app, saying how to sign it in.
// `mcp list` doesn't start a branch's own servers: unapproved, they read
// "not loaded (needs approval)" (probed on 2026.10.01).
import { homedir } from "node:os";
import { join } from "node:path";
import type { Check } from "../doctor";
import { Shareable } from "../errors";
import type { Exec } from "../exec";

export type McpState =
  | { state: "ready" }
  | { state: "signed-out" }
  | { state: "missing" }
  | { state: "other"; status: string };

/** The server's line in `cursor-agent mcp list`: `gatherd: requires_authentication`. */
export function readMcpList(stdout: string, server: string): McpState {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the escape is what is removed.
  const plain = stdout.replace(/\u001b\[[0-9;]*m/g, "");
  for (const line of plain.split("\n")) {
    const at = line.indexOf(": ");
    if (at < 0 || line.slice(0, at).trim() !== server) continue;
    const status = line.slice(at + 2).trim();
    if (status === "ready") return { state: "ready" };
    if (status === "requires_authentication") return { state: "signed-out" };
    return { state: "other", status };
  }
  return { state: "missing" };
}

/** A folder as one shell word, for a command the person pastes. */
function quoted(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

/** The command that signs this folder in, for the person at the machine to paste. */
export function signInLine(cwd: string, server: string): string {
  // Both quoted: a pasted line runs in a shell, and the name came with the pairing.
  return `cd ${quoted(cwd)} && cursor-agent mcp login ${quoted(server)}`;
}

/** Long enough for Cursor to start the person's own stdio servers; past it, the run goes ahead. */
const PATIENCE_MS = 30_000;

export async function cursorMcpState(
  run: Exec,
  cwd: string,
  server: string,
  patienceMs = PATIENCE_MS,
): Promise<McpState | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((done) => {
    timer = setTimeout(() => done(null), patienceMs);
  });
  const listed = run(["cursor-agent", "mcp", "list"], { cwd }).then(
    (result) => (result.code === 0 ? readMcpList(result.stdout, server) : null),
    () => null,
  );
  try {
    return await Promise.race([listed, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Refuses a Cursor run that couldn't reach the app's MCP server. The reason
 * goes to the app, so it names no folder; the line that fixes it goes to
 * this machine's log.
 */
export async function requireCursorSignIn(
  run: Exec,
  o: { cwd: string; mcpServer: string; onEvent?: (line: string) => void },
  patienceMs?: number,
): Promise<void> {
  const found = await cursorMcpState(run, o.cwd, o.mcpServer, patienceMs);
  const server = o.mcpServer;
  if (found === null) {
    o.onEvent?.(`couldn't ask Cursor whether it is signed in to ${server}; starting anyway`);
    return;
  }
  if (found.state === "ready") return;
  if (found.state === "signed-out") {
    o.onEvent?.(`Cursor isn't signed in to ${server} here. Sign in: ${signInLine(o.cwd, server)}`);
    throw new Shareable(
      `Cursor isn't signed in to ${server} in this run's folder, so it couldn't read what it was asked. Cursor keeps MCP sign-ins per folder, and a new branch is a new folder. On that machine, wakectl logs shows the one command that signs it in; then ask again.`,
    );
  }
  if (found.state === "missing") {
    throw new Shareable(
      `Cursor has no MCP server named ${server}, so it couldn't read what it was asked. Add the app's server to Cursor (~/.cursor/mcp.json) under that name, then ask again.`,
    );
  }
  throw new Shareable(
    `Cursor's ${server} server is ${found.status} in this run's folder, so it couldn't read what it was asked.`,
  );
}

/** For `wakectl doctor`: each Cursor pairing's server is in Cursor's own config. */
export async function cursorChecks(servers: readonly string[], home = homedir()): Promise<Check[]> {
  if (servers.length === 0) return [];
  let listed: string[] = [];
  try {
    const config: unknown = await Bun.file(join(home, ".cursor", "mcp.json")).json();
    const all = (config as { mcpServers?: unknown }).mcpServers;
    if (typeof all === "object" && all !== null) listed = Object.keys(all);
  } catch {
    // No config, or not JSON: every server reads as missing below.
  }
  const checks: Check[] = servers.map((server) =>
    listed.includes(server)
      ? { level: "ok", what: `Cursor has the ${server} MCP server` }
      : {
          level: "warn",
          what: `Cursor has no ${server} MCP server`,
          detail: "Its runs can't read what they were asked.",
          fix: `Add ${server} to ~/.cursor/mcp.json`,
        },
  );
  checks.push({
    level: "info",
    what: "Cursor signs in per folder",
    detail:
      "A run on a new branch stops until its folder is signed in; wakectl logs gives the command.",
  });
  return checks;
}
