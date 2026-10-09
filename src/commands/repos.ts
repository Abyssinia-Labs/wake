// `wakectl repos`: which repositories each app may run in on this machine.
// An app names the repository in each summons; without this, any clone in
// the folders Wake looks in would do (the security pass, 2026-10-08).
import { type Config, domainKey, loadConfig, saveConfig } from "../config";
import { isRepo } from "../contract";
import { say } from "../log";
import { bold, cyan, dim, mark } from "../ui";

/** The domain a command means: the one given, or the only one paired. */
function domainOf(config: Config, given: string | undefined): string {
  if (given) return domainKey(given);
  const domains = [...new Set(Object.values(config.apps).map((app) => app.domain))];
  const [only] = domains;
  if (domains.length === 1 && only) return only;
  throw new Error(
    domains.length === 0
      ? "Nothing is paired yet: wakectl pair first."
      : `Say which app: ${domains.join(", ")}.`,
  );
}

/** The command a ticket tells the person to run, word for word. */
export function approveLine(domain: string, repo: string): string {
  return `wakectl repos allow ${repo.toLowerCase()} --app ${domainKey(domain)}`;
}

export function reposLines(config: Config): string[] {
  const entries = Object.entries(config.repos);
  if (entries.length === 0) {
    return [
      `No repositories approved yet. ${dim("A run is refused until its repository is:")} ${cyan("wakectl repos allow <owner/name>")}`,
    ];
  }
  return entries.flatMap(([domain, repos]) => [
    bold(domain),
    ...repos.map((repo) => `  ${mark.ok()} ${repo}`),
  ]);
}

/** `wakectl repos [allow|remove <owner/name>] [--app <domain>]`. */
export async function repos(
  action: string | undefined,
  repo: string | undefined,
  app: string | undefined,
): Promise<void> {
  const config = await loadConfig();
  if (action === undefined) return say(reposLines(config).join("\n"));
  if ((action !== "allow" && action !== "remove") || !repo) {
    throw new Error("usage: wakectl repos [allow|remove <owner/name>] [--app <domain>]");
  }
  if (!isRepo(repo)) throw new Error(`${repo} isn't owner/name, as on GitHub.`);
  const domain = domainOf(config, app);
  const name = repo.toLowerCase();
  const rest = (config.repos[domain] ?? []).filter((one) => one !== name);
  const next = action === "allow" ? [...rest, name] : rest;
  const all = { ...config.repos, [domain]: next };
  if (next.length === 0) delete all[domain];
  await saveConfig({ ...config, repos: all });
  say(
    action === "allow"
      ? `${mark.ok()} ${bold(domain)} may run in ${bold(name)} on this machine`
      : `${mark.ok()} ${bold(domain)} no longer runs in ${bold(name)} here`,
  );
}
