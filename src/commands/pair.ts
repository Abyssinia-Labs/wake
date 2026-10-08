// `wakectl pair <domain> <code>` and `wakectl forget <domain>`. The code
// comes from the agent itself (the pattern's "Places"): it asked its app
// for one over its own connection, so the place is that agent's.
import { access } from "node:fs/promises";
import { hostname } from "node:os";
import { domainKey, loadConfig, saveConfig } from "../config";
import { discover, forgetPlace, isUnpaired, pairPlace } from "../http";
import { plistPath } from "../launchd";
import { say } from "../log";
import { keychain } from "../secrets";

export async function pair(domain: string, code: string): Promise<void> {
  const key = domainKey(domain);
  const discovery = await discover(domain);
  const paired = await pairPlace(discovery, code.trim().toUpperCase(), {
    name: hostname(),
    platform: process.platform,
  });
  await keychain.set(key, paired.placeKey);
  const config = await loadConfig();
  config.apps[key] = {
    ...config.apps[key],
    domain: key,
    app: paired.app,
    agent: paired.agent,
    convexUrl: discovery.convexUrl,
    httpBase: discovery.httpBase,
    pairedAt: Date.now(),
  };
  await saveConfig(config);
  say(
    `Paired with ${paired.app} as ${paired.agent.name}. A mention or an assignment now starts it here.`,
  );
  try {
    await access(plistPath());
  } catch {
    say("Wake isn't running yet: run `wakectl install` to start it now and at every login.");
  }
}

export async function forget(domain: string): Promise<void> {
  const key = domainKey(domain);
  const config = await loadConfig();
  const app = config.apps[key];
  if (!app) {
    say(`Wake isn't paired with ${key}.`);
    return;
  }
  const placeKey = await keychain.get(key);
  if (placeKey) {
    try {
      await forgetPlace(app, placeKey);
    } catch (error) {
      // Already gone on the app's side is what forgetting wanted.
      if (!isUnpaired(error)) throw error;
    }
    await keychain.delete(key);
  }
  delete config.apps[key];
  await saveConfig(config);
  say(`Forgot ${key}. ${app.agent.name} is no longer started from this machine.`);
}
