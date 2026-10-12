// The one run the demo plays, as a person sees it: the issue on GitHub, the
// Claude Code session Wake starts, the lines `wake logs -f` paints, and the
// pull request at the end. The shapes are the real ones: the bridge's prompt
// and status comment (apps/github/src/asks.ts, status.ts), the listener's
// log lines (src/scheduler.ts, src/listener.ts), Claude Code's own display.
// `at` is the first phase of the demo a thing shows in; the phases are
// 0–2 the issue, 3–7 the machine, 8–10 the pull request.

export const PHASES = 11;
export const STEP_OF_PHASE = [0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2];
export const LAST_PHASE_OF_STEP = [2, 7, 10];

export const issue = {
  repo: "acme/cli",
  number: 42,
  title: "Add --json to wake status",
  asker: "michael",
  body: "Our dashboard scrapes the table. A --json flag that prints the same rows, one object per run, would do.",
};

export const run = {
  name: "amber-heron",
  tool: "Claude Code",
  branch: "issue-42-add-json-to-wake-status",
  worktree: "~/Projects/cli/.claude/worktrees/issue-42-add-json-to-wake-status",
};

/** The bridge's prompt, as the session shows it. */
export const prompt =
  "GitHub started you through Wake: michael asked you to work on issue acme/cli#42 (https://github.com/acme/cli/issues/42). 1. Read it and its comments with `gh issue view 42 --repo acme/cli --comments`. Run each gh command on its own, not chained with others. 2. If it asks for a change, make it on the branch you are on, issue-42-add-json-to-wake-status: commit, push it, and open a pull request with `gh pr create` whose body says `Closes #42`. Never merge it. 3. Comment on the issue with `gh issue comment 42 --repo acme/cli`, saying what you did.";

export type SessionLine =
  | { at: number; kind: "say"; text: string }
  | { at: number; kind: "tool"; text: string; result: string };

export const session: SessionLine[] = [
  { at: 4, kind: "say", text: "I'll read the issue first." },
  {
    at: 4,
    kind: "tool",
    text: "Bash(gh issue view 42 --repo acme/cli --comments)",
    result: "title: Add --json to wake status · state: OPEN · labels: wake, enhancement … +9 lines",
  },
  { at: 5, kind: "tool", text: "Read(src/commands/status.ts)", result: "Read 142 lines" },
  {
    at: 5,
    kind: "tool",
    text: "Update(src/commands/status.ts)",
    result: "Updated src/commands/status.ts with 21 additions and 2 removals",
  },
  { at: 6, kind: "tool", text: "Bash(bun test)", result: "36 pass, 0 fail, 214 expect() calls" },
  {
    at: 6,
    kind: "tool",
    text: 'Bash(git commit -am "Add --json to wake status")',
    result: "[issue-42-add-json-to-wake-status 3f2c1a9] Add --json to wake status",
  },
  {
    at: 6,
    kind: "tool",
    text: "Bash(git push -u origin issue-42-add-json-to-wake-status)",
    result: "branch 'issue-42-add-json-to-wake-status' set up to track 'origin/issue-42-…'",
  },
  {
    at: 7,
    kind: "tool",
    text: 'Bash(gh pr create --repo acme/cli --title "Add --json to wake status" --body "Closes #42. …")',
    result: "https://github.com/acme/cli/pull/43",
  },
  {
    at: 7,
    kind: "tool",
    text: 'Bash(gh issue comment 42 --repo acme/cli --body "Opened #43: …")',
    result: "https://github.com/acme/cli/issues/42#issuecomment-2",
  },
  {
    at: 7,
    kind: "say",
    text: "Opened #43. `wake status --json` prints the rows the table shows, one object per run, and nothing when there are none.",
  },
];

/** `wake logs -f`: the stamp is painted dim, the rest by its first word (src/log-colors.ts). */
export type LogTone = "plain" | "cyan" | "bold" | "green";
export const logLines: { at: number; stamp: string; tone: LogTone; text: string }[] = [
  {
    at: 3,
    stamp: "12:03:52",
    tone: "plain",
    text: "Listening to github.wakectl.dev for Claude (Claude Code).",
  },
  {
    at: 3,
    stamp: "12:04:01",
    tone: "cyan",
    text: "Claimed acme/cli#42 on github.wakectl.dev (assigned).",
  },
  {
    at: 3,
    stamp: "12:04:03",
    tone: "bold",
    text: `Started acme/cli#42 as amber-heron in Claude Code, session 9c1e4b2a, in ${run.worktree}.`,
  },
  {
    at: 4,
    stamp: "12:04:09",
    tone: "plain",
    text: "acme/cli#42: Bash: gh issue view 42 --repo acme/cli --comments",
  },
  { at: 5, stamp: "12:04:31", tone: "plain", text: "acme/cli#42: Read: src/commands/status.ts" },
  { at: 5, stamp: "12:04:58", tone: "plain", text: "acme/cli#42: Edit: src/commands/status.ts" },
  { at: 6, stamp: "12:06:52", tone: "plain", text: "acme/cli#42: Bash: bun test" },
  {
    at: 6,
    stamp: "12:07:10",
    tone: "plain",
    text: "acme/cli#42: Bash: git push -u origin issue-42-add-json-to-wake-status",
  },
  {
    at: 7,
    stamp: "12:08:14",
    tone: "plain",
    text: "acme/cli#42: Bash: gh pr create --repo acme/cli --title …",
  },
  { at: 7, stamp: "12:08:19", tone: "plain", text: "acme/cli#42: finished after 14 turns" },
  {
    at: 7,
    stamp: "12:08:19",
    tone: "green",
    text: "Finished acme/cli#42 on github.wakectl.dev: done.",
  },
];

export const pullRequest = {
  number: 43,
  title: "Add --json to wake status",
  commits: [
    { sha: "3f2c1a9", message: "Add --json to wake status" },
    { sha: "8d04e77", message: "Test the JSON shape against the table" },
    { sha: "b61c2f0", message: "Note --json in the help" },
  ],
  files: 3,
  added: 21,
  removed: 2,
  body: "Closes #42. `wake status --json` prints the rows the table shows, one object per run, and nothing when there are none.",
  signature: "— Claude Code (Sonnet) via Wake · run amber-heron",
};
