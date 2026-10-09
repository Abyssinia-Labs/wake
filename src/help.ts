// `wakectl help`: the commands in groups, with examples. Apart from cli.ts so
// it is tested without running the command line.
import pkg from "../package.json";
import { bold, cyan, dim, pad } from "./ui";

type Entry = { use: string; what: string };

const GROUPS: readonly { title: string; entries: readonly Entry[] }[] = [
  {
    title: "Get started",
    entries: [
      { use: "setup", what: "Everything a first run needs, asked in order" },
      { use: "doctor", what: "What this machine has and lacks, with fixes" },
      { use: "pair <domain> <code>", what: "Pair with an app; your agent gives you the command" },
      {
        use: "  --tool claude|codex|cursor",
        what: "Which tool runs it, when the app could not tell",
      },
      { use: "repos allow <owner/name>", what: "Let an app run in one of your repositories" },
      { use: "install", what: "Start listening now and at every login" },
      { use: "status", what: "What is paired, connected and running" },
    ],
  },
  {
    title: "Watch",
    entries: [{ use: "logs [-f]", what: "The listener's log, following it with -f" }],
  },
  {
    title: "How runs work",
    entries: [
      { use: "mode [headless|herdr]", what: "In the background, or a tab in herdr you can watch" },
      { use: "permissions [mode]", what: "What a run may do unasked: acceptEdits, auto, dontAsk" },
      { use: "allow [rule] [--remove]", what: "Tools a run may use beyond Wake's own" },
      { use: "trust codex [on|off]", what: "Let Codex runs in herdr skip 'trust this folder?'" },
    ],
  },
  {
    title: "Housekeeping",
    entries: [
      { use: "pause | resume", what: "Stop or go on claiming new work" },
      { use: "prune [--days 14]", what: "Remove run worktrees untouched for a while" },
      { use: "forget <domain>", what: "Unpair its agents, here and on the app" },
      { use: "update", what: "The latest Wake from npm, and the listener onto it" },
      { use: "uninstall", what: "Stop, and do not start at login" },
      { use: "check <domain>", what: "Test an app against the wake/v1 spec" },
    ],
  },
];

export const COMMANDS = [
  "setup",
  "doctor",
  "check",
  "update",
  "pair",
  "forget",
  "install",
  "uninstall",
  "status",
  "logs",
  "pause",
  "resume",
  "mode",
  "permissions",
  "allow",
  "trust",
  "repos",
  "prune",
  "listen",
  "help",
];

export function help(): string {
  const width = 34;
  const lines = [
    `${bold("wakectl")} ${dim(`v${pkg.version}`)}  starts your agent when an app hands it work`,
    "",
  ];
  for (const group of GROUPS) {
    lines.push(bold(group.title));
    for (const entry of group.entries) {
      lines.push(`  ${pad(cyan(entry.use), width)}${dim(entry.what)}`);
    }
    lines.push("");
  }
  lines.push(
    bold("Examples"),
    `  ${dim("$")} wakectl setup`,
    `  ${dim("$")} wakectl pair app.example.com K7QD-2M9X`,
    `  ${dim("$")} wakectl repos allow your-org/your-repo`,
    `  ${dim("$")} wakectl mode herdr`,
    `  ${dim("$")} wakectl allow "Bash(npm test:*)"`,
    "",
    dim("wake is the same command, shorter to type: wake status, wake logs -f."),
    dim("Colour is off when NO_COLOR is set or the output is not a terminal."),
  );
  return lines.join("\n");
}
