// What the hero's Wake for Mac window shows: one run printing its steps as
// it fixes an issue, beside the runs of a day. Every app is GitHub and
// every repository acme's, as on the rest of the site.
import type { RunStep } from "./live-run-print";

export type RunStatus = "running" | "waiting" | "done" | "failed";
export type ListRow = { name: string; status: RunStatus; said: string; time: string };

export const HOST = "Ada's MacBook Pro";

export const LIVE = {
  name: "brisk-lark",
  ref: "acme/widgets#214",
  app: "GitHub",
  started: "2:52 PM",
  ended: "2:56 PM",
  minutes: 4,
  repository: "widgets, on wake/brisk-lark",
  worktree: "~/code/widgets/.claude/worktrees/wake--brisk-lark",
  resume:
    "cd '/Users/ada/code/widgets/.claude/worktrees/wake--brisk-lark' && claude --resume 6c1d2f0e-77aa-4c2b-9f1e-0b8a5d3c2e11",
};

const step = (at: number, clock: string, kind: RunStep["kind"], line: string): RunStep => ({
  at,
  clock,
  kind,
  line,
});

export const STEPS: RunStep[] = [
  step(0, "2:52 PM", "wake", "herdr is not running, so this run is headless"),
  step(0.55, "2:52 PM", "wake", "model: opus, high effort"),
  step(1, "2:52 PM", "wake", "began (claude-opus-5-5)"),
  step(1.7, "2:52 PM", "tool", "ToolSearch"),
  step(2.1, "2:52 PM", "tool", "Bash: gh issue view 214 --comments"),
  step(3, "2:52 PM", "tool", "Bash: ls; cat CLAUDE.md | head -200; ls .claude/rules 2>/dev/null"),
  step(3.45, "2:52 PM", "tool", 'Bash: grep -rn "startOfWeek" src | head -30'),
  step(
    4.5,
    "2:53 PM",
    "said",
    "said: The picker counts weeks from Sunday, but the locale starts them on Monday.",
  ),
  step(6.4, "2:53 PM", "tool", "Read: src/components/date-picker/week-grid.tsx"),
  step(6.55, "2:53 PM", "tool", "Read: src/lib/locale.ts"),
  step(6.7, "2:53 PM", "tool", "Read: test/date-picker/week-grid.test.tsx"),
  step(7.8, "2:53 PM", "tool", "Edit: src/components/date-picker/week-grid.tsx"),
  step(8.6, "2:54 PM", "tool", "Bash: bun test date-picker"),
  step(
    10.6,
    "2:54 PM",
    "said",
    "said: Three tests fail because their fixture assumes Sunday. Updating the fixture.",
  ),
  step(12.4, "2:54 PM", "tool", "Edit: test/fixtures/weeks.ts"),
  step(13.1, "2:55 PM", "tool", "Bash: bun test date-picker (48 pass)"),
  step(14.2, "2:55 PM", "tool", "Bash: bun run typecheck && bun run lint"),
  step(15.6, "2:55 PM", "tool", 'Bash: git commit -m "Start weeks on the locale\'s first day"'),
  step(16.05, "2:55 PM", "tool", "Bash: git push -u origin wake/brisk-lark"),
  step(
    17,
    "2:56 PM",
    "tool",
    'Bash: gh pr create --title "Start weeks on the locale\'s first day"',
  ),
  step(18.1, "2:56 PM", "said", "said: Opened #215. Weeks now start on the locale's first day."),
];

/** The other runs of the day, around the live one. */
export const GOING: ListRow[] = [
  { name: "amber-heron", status: "waiting", said: "Waiting on you: acme/web#88", time: "6 min" },
  { name: "quiet-otter", status: "running", said: "On it: acme/api#812", time: "18 min" },
];
export const TODAY: ListRow[] = [
  { name: "sandy-yak", status: "done", said: "Done: acme/api#806", time: "11:42 AM" },
];
export const YESTERDAY: ListRow[] = [
  { name: "misty-finch", status: "failed", said: "Couldn't finish acme/web#80", time: "7:00 PM" },
  { name: "keen-wombat", status: "done", said: "Done: acme/widgets#209", time: "4:16 PM" },
  { name: "calm-bison", status: "done", said: "Done: acme/docs#57", time: "1:37 PM" },
];
