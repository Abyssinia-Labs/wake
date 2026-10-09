// `wakectl listen`: what the LaunchAgent runs. It connects every paired app,
// hands their summonses to the scheduler, and looks at the config every
// half minute, so a `wakectl pair` or `forget` takes effect without a
// restart.
import { existsSync } from "node:fs";
import { recordAsked } from "./asked";
import { type Config, keepPrivate, loadConfig, paths } from "./config";
import { exec } from "./exec";
import { messageOf, note } from "./log";
import { connectPlace, type LivePlace } from "./place";
import { realDeps, runSummons } from "./run";
import { type Place, Scheduler } from "./scheduler";
import { keychain } from "./secrets";
import { type ListenerState, type RunState, writeState } from "./state";
import { programOf, TOOL_NAMES, toolInstalled, toolOf } from "./tools";

const RECONCILE_MS = 30_000;

export async function listen(): Promise<void> {
  const p = paths();
  await keepPrivate(p);
  const deps = realDeps(exec);
  const startedAt = Date.now();
  const live = new Map<string, LivePlace>();
  // Keyed by domain, holding the pairing's `pairedAt`: a new `wakectl pair`
  // changes it, which is how a refused or re-keyed place gets another try.
  const unpaired = new Map<string, number>();
  const pairings = new Map<string, number>();
  // Pairings whose tool is not installed here, by key, with the program: not
  // connected, so nothing is claimed that this machine cannot run.
  const missing = new Map<string, string>();
  const runs = new Map<string, RunState>();
  // Runs under way and the place that claimed each, so stopping can finish them.
  const active = new Map<string, Place>();
  let config: Config = await loadConfig();

  const save = async (): Promise<void> => {
    const apps: ListenerState["apps"] = {};
    for (const [domain, app] of Object.entries(config.apps)) {
      apps[domain] = {
        agent: app.agent.name,
        connected: live.get(domain)?.connected() ?? false,
        unpaired: unpaired.has(domain),
        ...(missing.has(domain) ? { missing: missing.get(domain) } : {}),
      };
    }
    const state: ListenerState = {
      pid: process.pid,
      startedAt,
      updatedAt: Date.now(),
      apps,
      runs: [...runs.values()],
    };
    await writeState(p.state, state).catch((e) => note(`Could not write state: ${messageOf(e)}`));
  };

  const scheduler = new Scheduler({
    maxRuns: config.maxRuns,
    isPaused: () => existsSync(p.paused),
    note,
    work: async (place, summons, run) => {
      const app = config.apps[place.domain];
      if (!app) return { id: summons.id, outcome: "failed", reason: "Wake was unpaired mid-run." };
      active.set(summons.id, place);
      try {
        return await runSummons(summons, run, app, {
          config,
          paths: p,
          deps,
          onEvent: (line) => note(`${summons.target.ref}: ${line}`),
          onStart: ({ sessionId, cwd, tool, name }) => {
            const known = runs.get(summons.id);
            note(
              known
                ? `${summons.target.ref} (${name}): ${TOOL_NAMES[tool]} session ${sessionId}`
                : `Started ${summons.target.ref} as ${name} in ${TOOL_NAMES[tool]}${sessionId ? `, session ${sessionId},` : ""} in ${cwd}.`,
            );
            runs.set(summons.id, {
              app: app.app,
              ref: summons.target.ref,
              sessionId,
              cwd,
              tool,
              name,
              startedAt: known?.startedAt ?? Date.now(),
            });
            void save();
          },
          report: (run) => place.started(summons.id, run),
        });
      } finally {
        active.delete(summons.id);
        runs.delete(summons.id);
        void save();
      }
    },
  });

  const disconnect = async (domain: string): Promise<void> => {
    scheduler.drop(domain);
    await live.get(domain)?.close();
    live.delete(domain);
    pairings.delete(domain);
  };

  const reconcile = async (): Promise<void> => {
    config = await loadConfig();
    for (const domain of [...live.keys()]) {
      const app = config.apps[domain];
      if (!app) {
        await disconnect(domain);
        note(`Forgot ${domain}.`);
      } else if (pairings.get(domain) !== app.pairedAt) {
        await disconnect(domain);
      }
    }
    for (const domain of [...unpaired.keys()]) {
      if (unpaired.get(domain) !== config.apps[domain]?.pairedAt) unpaired.delete(domain);
    }
    for (const [domain, app] of Object.entries(config.apps)) {
      if (live.has(domain) || unpaired.has(domain)) continue;
      const tool = toolOf(app);
      if (!tool) {
        if (!missing.has(domain)) {
          note(`No tool runs ${app.agent.name} on this machine, so ${domain} is not listened to.`);
        }
        missing.set(domain, "no tool");
        continue;
      }
      if (!(await toolInstalled(exec, tool))) {
        if (!missing.has(domain)) {
          note(
            `${TOOL_NAMES[tool]} (${programOf(tool)}) isn't installed, so ${domain} for ${app.agent.name} is not listened to.`,
          );
        }
        missing.set(domain, programOf(tool));
        continue;
      }
      missing.delete(domain);
      const key = await keychain.get(domain);
      if (!key) {
        note(`No key for ${domain} in the Keychain; pair it again.`);
        unpaired.set(domain, app.pairedAt);
        continue;
      }
      pairings.set(domain, app.pairedAt);
      live.set(
        domain,
        connectPlace(
          app,
          key,
          {
            onList: (place, summonses) => {
              // What the app asks for, so setup offers those repositories first.
              const repos = summonses.flatMap((s) => (s.repo ? [s.repo] : []));
              void recordAsked(p.asked, app.domain, repos).catch((e) =>
                note(`Could not record the repositories asked for: ${messageOf(e)}`),
              );
              scheduler.offer(place, summonses);
            },
            onUnpaired: (d) => {
              unpaired.set(d, app.pairedAt);
              note(`${d} refused this place: it was forgotten or ${app.agent.name} was stopped.`);
              // Not from inside the client's own auth callback.
              queueMicrotask(() => void disconnect(d));
            },
            note,
          },
          domain,
        ),
      );
      note(`Listening to ${app.domain} for ${app.agent.name} (${TOOL_NAMES[tool]}).`);
    }
    scheduler.poke();
    await save();
  };

  const tick = (): void => {
    reconcile().catch((e) => note(`Could not reload: ${messageOf(e)}`));
  };

  const stop = async (signal: string): Promise<void> => {
    note(`Stopping on ${signal}.`);
    // A run cut off here would otherwise show as under way on its ticket for good.
    await Promise.race([
      Promise.all(
        [...active].map(([id, place]) =>
          place
            .finish({ id, outcome: "failed", reason: "Wake stopped before the run finished." })
            .catch((e) => note(`Could not report ${id}: ${messageOf(e)}`)),
        ),
      ),
      Bun.sleep(5_000),
    ]);
    await Promise.all([...live.keys()].map(disconnect));
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));

  note(`Wake ${process.pid} listening, ${config.maxRuns} runs at most.`);
  await reconcile();
  if (Object.keys(config.apps).length === 0) note("Nothing paired yet: run wakectl pair.");
  setInterval(tick, RECONCILE_MS);
}
