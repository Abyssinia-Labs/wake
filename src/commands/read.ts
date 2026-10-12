// `wakectl read <url>`: a comment on GitHub, by its address, read-only
// (WAK-19). A run may not use `gh api`: it can write anything, and no
// pattern tells its reads from its writes. But an inline review comment is
// only reachable through it. So Wake reads one: the address must be a
// GitHub comment's, and it becomes exactly one fixed GET, with no flags.
import { CommandError, type Exec, exec } from "../exec";
import { say } from "../log";

const REPO = "([A-Za-z0-9][A-Za-z0-9-]*)/([A-Za-z0-9._-]+)";
const KINDS: { pattern: RegExp; path: (m: string[]) => string }[] = [
  {
    // An inline review comment: …/pull/13#discussion_r7
    pattern: new RegExp(`^https://github\\.com/${REPO}/pull/\\d+#discussion_r(\\d+)$`),
    path: (m) => `repos/${m[1]}/${m[2]}/pulls/comments/${m[3]}`,
  },
  {
    // A comment on an issue or a pull request's conversation: …/issues/12#issuecomment-9
    pattern: new RegExp(`^https://github\\.com/${REPO}/(?:issues|pull)/\\d+#issuecomment-(\\d+)$`),
    path: (m) => `repos/${m[1]}/${m[2]}/issues/comments/${m[3]}`,
  },
  {
    // A review: …/pull/13#pullrequestreview-5
    pattern: new RegExp(`^https://github\\.com/${REPO}/pull/(\\d+)#pullrequestreview-(\\d+)$`),
    path: (m) => `repos/${m[1]}/${m[2]}/pulls/${m[3]}/reviews/${m[4]}`,
  },
];

/** The API path a comment's address reads, or null for anything else. */
export function readPath(url: string): string | null {
  for (const kind of KINDS) {
    const match = url.trim().match(kind.pattern);
    if (match && !url.includes("..")) return kind.path([...match]);
  }
  return null;
}

function text(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** The comment as a run reads it: who, where, the code it's on, and what it says. */
export function shown(raw: unknown): string {
  const c = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const user = c.user as Record<string, unknown> | undefined;
  const who = text(user?.login) ?? "someone";
  const file = text(c.path);
  const line =
    typeof c.line === "number"
      ? c.line
      : typeof c.original_line === "number"
        ? c.original_line
        : null;
  const lines = [file ? `${who}, on ${file}${line === null ? "" : `:${line}`}:` : `${who}:`];
  const hunk = text(c.diff_hunk);
  if (hunk)
    lines.push(
      "",
      "The code it's on:",
      ...hunk
        .split("\n")
        .slice(-12)
        .map((l) => `  ${l}`),
    );
  lines.push("", text(c.body) ?? "(no text)");
  return lines.join("\n");
}

export async function read(url: string | undefined, run: Exec = exec): Promise<void> {
  const path = url ? readPath(url) : null;
  if (!url || !path) {
    throw new Error(
      "Give a GitHub comment's address: …/pull/13#discussion_r7, …/issues/12#issuecomment-9 or …/pull/13#pullrequestreview-5.",
    );
  }
  const cmd = ["gh", "api", path];
  const result = await run(cmd);
  if (result.code !== 0) throw new CommandError(cmd, result);
  say(shown(JSON.parse(result.stdout) as unknown));
}
