// What a Claude Code run may do, as one settings object passed with
// `--settings` (headless and in herdr alike), with the branch's own settings
// left out by `--setting-sources user`.
//
// Shell commands run in Claude Code's sandbox (Seatbelt on macOS): they may
// write only in the worktree, reach only GitHub and npm, and never read the
// person's other credentials, so planted text in a ticket has nothing to
// take and nowhere to send it (the security pass, 2026-10-08). Inside it they
// run without asking. `git push`, `git fetch`/`pull` and `gh` cannot run in
// it (SSH and gh's Keychain token fail there), so they run outside, and only
// the forms listed here go ahead unasked. The deny list is a guardrail, not
// a wall; branch protection on the repository is the wall.
import type { ClaudeRun } from "./claude";

/** The person's other credentials: never read by a run, by any tool. */
export const SECRETS = [
  "~/.ssh",
  "~/.aws",
  "~/.config/gh",
  "~/.gnupg",
  "~/.netrc",
  "~/.npmrc",
  "~/.docker",
  "~/.kube",
  "~/.codex",
  "~/.cursor",
  "~/Library/Keychains",
  "~/Library/Application Support/Wake",
];

/** Where sandboxed commands may connect: git hosting and the npm registry. */
export const HOSTS = [
  "github.com",
  "*.github.com",
  "*.githubusercontent.com",
  "registry.npmjs.org",
];

/** Commands that can't run in the sandbox; each still needs an allow rule to run unasked. */
const OUTSIDE = ["git push *", "git fetch *", "git pull *", "gh *"];

const GH_READS = [
  "pr view",
  "pr list",
  "pr checks",
  "pr diff",
  "issue view",
  "run view",
  "run list",
];

function outsideAllowed(branch: string | undefined): string[] {
  const pushes = branch
    ? [
        `Bash(git push origin ${branch})`,
        `Bash(git push -u origin ${branch})`,
        `Bash(git push --set-upstream origin ${branch})`,
      ]
    : [];
  return [
    ...pushes,
    "Bash(git fetch *)",
    ...GH_READS.map((one) => `Bash(gh ${one} *)`),
    "Bash(gh pr create *)",
    "Bash(gh pr comment *)",
    "Bash(gh pr edit *)",
  ];
}

export function claudeAllowed(
  o: Pick<ClaudeRun, "mcpServer" | "defaultBranch" | "branch" | "extraAllowedTools">,
): string[] {
  const own = `mcp__${o.mcpServer}`;
  if (!o.defaultBranch) return [own];
  // Reads in the worktree need no rule; edits are kept to it.
  return ["Edit(./**)", ...outsideAllowed(o.branch), own, ...o.extraAllowedTools];
}

export function claudeDenied(defaultBranch?: string): string[] {
  const fences = [
    "Bash(gh pr merge *)",
    "Bash(gh api *)",
    "Bash(gh auth *)",
    "Bash(gh secret *)",
    "Bash(gh gist *)",
    "Bash(gh repo delete *)",
    "Bash(git push --force *)",
    "Bash(git push -f *)",
    "Bash(git push --force-with-lease *)",
    "Bash(git push --mirror *)",
    "Bash(git push --all *)",
    "Bash(git push --delete *)",
    "Bash(git -c *)",
    "Bash(git config *)",
    "Bash(bunx *)",
    "Bash(bun -e *)",
    "Bash(bun --eval *)",
    ...SECRETS.map((path) => `Read(${path}/**)`),
  ];
  if (defaultBranch) {
    fences.push(
      `Bash(git push origin ${defaultBranch} *)`,
      `Bash(git push origin HEAD:${defaultBranch} *)`,
      `Bash(git push -u origin ${defaultBranch} *)`,
    );
  }
  return fences;
}

/** The whole of a run's settings: permissions and the sandbox. */
export function claudeSettings(o: ClaudeRun): Record<string, unknown> {
  return {
    permissions: {
      defaultMode: o.permissionMode ?? "acceptEdits",
      allow: claudeAllowed(o),
      deny: claudeDenied(o.defaultBranch),
    },
    sandbox: {
      enabled: true,
      // Unsandboxed is never the fallback: no sandbox, no run.
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      // A room has no worktree and no code to run: its shell still asks.
      autoAllowBashIfSandboxed: o.defaultBranch !== undefined,
      excludedCommands: o.defaultBranch ? OUTSIDE : [],
      filesystem: { denyRead: SECRETS },
      network: { allowedDomains: o.defaultBranch ? HOSTS : [] },
    },
  };
}

/** `Bash(npm test:*)`, as `wakectl allow` keeps it, in Cursor's spelling. */
export function asCursorRule(rule: string): string | null {
  // Cursor matches the command's first word, then its arguments after a colon:
  // Bash(npm test:*) allows `npm test …` and is Shell(npm:test*), not all of npm.
  const bash = rule.match(/^Bash\(([^\s:()]+)((?:\s+[^:()]+)?)(?::\*)?\)$/);
  if (bash?.[1]) {
    const rest = (bash[2] ?? "").trim();
    return rest ? `Shell(${bash[1]}:${rest}*)` : `Shell(${bash[1]})`;
  }
  return /^(Shell|Read|Write|Mcp|WebFetch)\(.+\)$/.test(rule) ? rule : null;
}

/**
 * Cursor's project permissions (.cursor/cli.json). With `--sandbox enabled`,
 * a command off the allow list runs sandboxed without asking: it writes only
 * in the worktree and reaches no network. A command on the list runs outside
 * the sandbox, so the list holds only what must: pushing the run's branch,
 * fetching, and gh's pull-request work. Cursor's sandbox does not hide the
 * person's credentials from a shell command, as Claude Code's does; its
 * network is off, which leaves the app's own tools as the only way out.
 */
export function cursorPermissions(o: ClaudeRun): { allow: string[]; deny: string[] } {
  const own = `Mcp(${o.mcpServer}:*)`;
  if (!o.defaultBranch) return { allow: [own], deny: ["Shell(*)", "Write(**)"] };
  const extra = o.extraAllowedTools.map(asCursorRule).filter((one): one is string => one !== null);
  const pushes = o.branch
    ? [`Shell(git:push origin ${o.branch})`, `Shell(git:push -u origin ${o.branch})`]
    : [];
  return {
    allow: [
      "Read(**)",
      "Write(**)",
      ...pushes,
      "Shell(git:fetch*)",
      ...GH_READS.map((one) => `Shell(gh:${one}*)`),
      "Shell(gh:pr create*)",
      "Shell(gh:pr comment*)",
      "Shell(gh:pr edit*)",
      own,
      ...extra,
    ],
    deny: [
      "Shell(gh:pr merge*)",
      "Shell(gh:api*)",
      "Shell(gh:auth*)",
      "Shell(git:push --force*)",
      "Shell(git:push -f*)",
      "Shell(git:push --force-with-lease*)",
      "Shell(git:push --mirror*)",
      "Shell(git:-c*)",
      "Shell(git:config*)",
      "Shell(bunx)",
      `Shell(git:push origin ${o.defaultBranch}*)`,
      `Shell(git:push origin HEAD:${o.defaultBranch}*)`,
      `Shell(git:push -u origin ${o.defaultBranch}*)`,
      ...SECRETS.map((path) => `Read(${path}/**)`),
    ],
  };
}
