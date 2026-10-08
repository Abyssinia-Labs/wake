#!/usr/bin/env bun
// wakectl: pair Wake with an app, run the listener, and look after it.
import { parseArgs } from "node:util";
import pkg from "../package.json";
import { forget, pair } from "./commands/pair";
import { prune } from "./commands/prune";
import { install, logs, pause, resume, uninstall } from "./commands/service";
import { allow, mode, permissions } from "./commands/settings";
import { status } from "./commands/status";
import { listen } from "./listener";
import { messageOf, say, warn } from "./log";

const HELP = `wakectl — starts your agent when Gatherd or Antescript hands it work

  wakectl pair <domain> <code>   Pair with an app (your agent gives you the command)
  wakectl forget <domain>        Unpair, here and on the app
  wakectl install                Start listening now and at every login
  wakectl uninstall              Stop, and don't start at login
  wakectl status                 What's paired, connected and running
  wakectl logs [-f]              The listener's log
  wakectl pause | resume         Stop or go on claiming new work
  wakectl mode [headless|herdr]  How runs start: headless, or a tab in herdr to watch
  wakectl permissions [acceptEdits|auto|dontAsk]
                                 What a run may do without asking
  wakectl allow [rule] [--remove]  Tools a run may use beyond Wake's own, as "Bash(npm test:*)"
  wakectl prune [--days 14]      Remove old run worktrees
  wakectl listen                 Run the listener here (install does this for you)
`;

async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      follow: { type: "boolean", short: "f", default: false },
      remove: { type: "boolean", default: false },
      days: { type: "string", default: "14" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (values.version) return say(pkg.version);
  if (values.help || !command || command === "help") return say(HELP);

  switch (command) {
    case "pair": {
      const [domain, code] = rest;
      if (!domain || !code) throw new Usage("wakectl pair <domain> <code>");
      return pair(domain, code);
    }
    case "forget": {
      const [domain] = rest;
      if (!domain) throw new Usage("wakectl forget <domain>");
      return forget(domain);
    }
    case "install":
      return install();
    case "uninstall":
      return uninstall();
    case "status":
      return status();
    case "logs":
      return logs(values.follow);
    case "mode":
      return mode(rest[0]);
    case "permissions":
      return permissions(rest[0]);
    case "allow":
      return allow(rest[0], values.remove);
    case "pause":
      return pause();
    case "resume":
      return resume();
    case "prune": {
      const days = Number(values.days);
      if (!Number.isFinite(days) || days < 0) throw new Usage("wakectl prune [--days <n>]");
      return prune(days);
    }
    case "listen":
      return listen();
    default:
      throw new Usage(`unknown command "${command}"; see wakectl help`);
  }
}

class Usage extends Error {
  constructor(usage: string) {
    super(`usage: ${usage}`);
    this.name = "Usage";
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  warn(`wakectl: ${messageOf(error)}`);
  process.exit(error instanceof Usage ? 2 : 1);
});
