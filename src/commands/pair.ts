// `wakectl pair <domain> <code>` and `wakectl forget <domain>`. The code
// comes from the agent itself (the pattern's "Places"): it asked its app
// for one over its own connection, so the place is that agent's.
//
// A machine can run several agents of one app, Claude Code's and Codex's
// say, so a pairing is keyed by the domain and its agent (GAT-68). One made
// before that is keyed by the domain alone and goes on working; pairing the
// same agent again replaces it.
import { access } from "node:fs/promises";
import { hostname } from "node:os";
import { type Config, domainKey, loadConfig, type PairedApp, saveConfig } from "../config";
import { AGENT_TOOLS, type AgentTool } from "../contract";
import { exec } from "../exec";
import { discover, forgetPlace, isUnpaired, pairPlace } from "../http";
import { plistPath } from "../launchd";
import { say } from "../log";
import { keychain } from "../secrets";
import { programOf, TOOL_NAMES, toolInstalled } from "../tools";
import { bold, cyan, dim, mark, spin } from "../ui";

/** The config's key for one agent of one app: readable in logs, unique per agent. */
export function pairingKey(domain: string, agent: { id: string; name: string }): string {
  const slug =
    agent.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "agent";
  return `${domain}/${slug}-${agent.id.slice(0, 6)}`;
}

/** The pairings a name means: every one of a domain, or the one with that key. */
export function pairingsOf(config: Config, name: string): [string, PairedApp][] {
  const host = domainKey(name);
  return Object.entries(config.apps).filter(
    ([key, app]) => app.domain === host || key === name || key === host,
  );
}

export async function pair(domain: string, code: string, toolFlag?: string): Promise<void> {
  const host = domainKey(domain);
  let forced: AgentTool | undefined;
  if (toolFlag !== undefined) {
    forced = AGENT_TOOLS.find((one) => one === toolFlag);
    if (!forced) throw new Error(`--tool is one of ${AGENT_TOOLS.join(", ")}`);
  }
  const discovery = await spin(`Finding Wake on ${host}`, () => discover(domain));
  const paired = await spin(`Pairing this machine (${hostname()})`, () =>
    pairPlace(discovery, code.trim().toUpperCase(), {
      name: hostname(),
      platform: process.platform,
    }),
  );
  const tool = forced ?? paired.agent.tool;
  const key = pairingKey(host, paired.agent);
  const config = await loadConfig();
  // The same agent paired before, under this key or the old domain-only one.
  for (const [old, app] of pairingsOf(config, host)) {
    if (app.agent.id === paired.agent.id && old !== key) {
      delete config.apps[old];
      await keychain.delete(old);
    }
  }
  await keychain.set(key, paired.placeKey);
  config.apps[key] = {
    domain: host,
    app: paired.app,
    agent: paired.agent,
    convexUrl: discovery.convexUrl,
    httpBase: discovery.httpBase,
    pairedAt: Date.now(),
    ...(tool ? { tool } : {}),
  };
  await saveConfig(config);

  const runner = tool ?? "claude";
  say(
    `${mark.ok()} Paired with ${bold(paired.app)} as ${bold(paired.agent.name)}, run by ${bold(TOOL_NAMES[runner])}`,
  );
  say(dim("  A mention or an assignment now starts it on this machine."));
  if (!tool) {
    say(
      dim(
        `  ${paired.app} did not say which tool asked; Claude Code it is. Pair with --tool codex or --tool cursor to change it.`,
      ),
    );
  }
  if (!(await toolInstalled(exec, runner))) {
    say(
      `${mark.warn()} ${TOOL_NAMES[runner]} (${programOf(runner)}) isn't installed here, so nothing is claimed for it until it is.`,
    );
  }
  try {
    await access(plistPath());
  } catch {
    say(
      `${mark.arrow()} Next: ${cyan("wakectl install")} ${dim("to start listening now and at every login")}`,
    );
  }
}

export async function forget(domain: string): Promise<void> {
  const host = domainKey(domain);
  const config = await loadConfig();
  const found = pairingsOf(config, domain);
  if (found.length === 0) {
    say(
      `${mark.warn()} Wake isn't paired with ${bold(host)}. ${dim("wakectl status lists what is.")}`,
    );
    return;
  }
  for (const [key, app] of found) {
    const placeKey = await keychain.get(key);
    if (placeKey) {
      await spin(`Telling ${app.domain} to forget ${app.agent.name} on this machine`, async () => {
        try {
          await forgetPlace(app, placeKey);
        } catch (error) {
          // Already gone on the app's side is what forgetting wanted.
          if (!isUnpaired(error)) throw error;
        }
      });
      await keychain.delete(key);
    }
    delete config.apps[key];
    say(`${mark.ok()} Forgot ${bold(app.agent.name)} on ${bold(app.domain)}`);
  }
  await saveConfig(config);
}
