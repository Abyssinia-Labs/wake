#!/usr/bin/env bun
// wakectl: pair Wake with an app, run the listener, and look after it.
import { parseArgs } from "node:util";
import pkg from "../package.json";
import { doctor, setup } from "./commands/doctor";
import { forget, pair } from "./commands/pair";
import { prune } from "./commands/prune";
import { repos } from "./commands/repos";
import { install, logs, pause, resume, uninstall } from "./commands/service";
import { allow, mode, permissions, trust } from "./commands/settings";
import { status } from "./commands/status";
import { COMMANDS, help } from "./help";
import { listen } from "./listener";
import { messageOf, say, warn } from "./log";
import { bold, closest, mark } from "./ui";

class Usage extends Error {
  constructor(usage: string) {
    super(`usage: wakectl ${usage}`);
    this.name = "Usage";
  }
}

async function main(argv: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      follow: { type: "boolean", short: "f", default: false },
      remove: { type: "boolean", default: false },
      tool: { type: "string" },
      app: { type: "string" },
      days: { type: "string", default: "14" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });
  const [command, ...rest] = positionals;
  if (values.version) return say(pkg.version);
  if (values.help || !command || command === "help") return say(help());

  switch (command) {
    case "setup":
      return setup();
    case "doctor":
      return doctor();
    case "pair": {
      const [domain, code] = rest;
      if (!domain || !code) throw new Usage("pair <domain> <code> [--tool claude|codex|cursor]");
      return pair(domain, code, values.tool);
    }
    case "forget": {
      const [domain] = rest;
      if (!domain) throw new Usage("forget <domain>");
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
    case "pause":
      return pause();
    case "resume":
      return resume();
    case "mode":
      return mode(rest[0]);
    case "permissions":
      return permissions(rest[0]);
    case "allow":
      return allow(rest[0], values.remove);
    case "repos":
      return repos(rest[0], rest[1], values.app);
    case "trust":
      return trust(rest[0], rest[1]);
    case "prune": {
      const days = Number(values.days);
      if (!Number.isFinite(days) || days < 0) throw new Usage("prune [--days <n>]");
      return prune(days);
    }
    case "listen":
      return listen();
    default: {
      const near = closest(command, COMMANDS);
      throw new Usage(
        `<command>; "${command}" is not one.${near ? ` Did you mean ${bold(near)}?` : ""} See wakectl help.`,
      );
    }
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  warn(`${mark.fail()} ${messageOf(error)}`);
  process.exit(error instanceof Usage ? 2 : 1);
});
