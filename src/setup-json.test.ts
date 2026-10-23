import { expect, test } from "bun:test";
import type { PairedApp } from "./config";
import { type Config, defaults } from "./config";
import { setupJson } from "./setup-json";

function paired(domain: string, name: string, tool?: PairedApp["tool"]): PairedApp {
  return {
    domain,
    app: domain.split(".")[0] ?? domain,
    agent: { id: name, name },
    httpBase: `https://${domain}`,
    pairedAt: 1,
    ...(tool ? { tool } : {}),
  };
}

const config: Config = {
  ...defaults(),
  roots: ["/Users/ada/code"],
  repos: { "gatherd.dev": ["acme/widgets"] },
  apps: {
    "gatherd.dev/claude": paired("gatherd.dev", "Claude", "claude"),
    "gatherd.dev/codex": paired("gatherd.dev", "Codex", "codex"),
    "antescript.app": paired("antescript.app", "Claude", "claude"),
  },
};

const json = setupJson({
  machine: [
    { level: "ok", what: "Bun 1.3.4" },
    { level: "info", what: "herdr", detail: "Runs can open as tabs: wakectl mode herdr" },
  ],
  config,
  folders: ["/Users/ada/code", "/Users/ada/Projects"],
  clones: [
    { repo: "acme/gadgets", path: "/Users/ada/code/gadgets" },
    { repo: "acme/widgets", path: "/Users/ada/code/widgets" },
  ],
  asked: { "antescript.app": ["acme/gadgets"], "gatherd.dev": ["acme/gadgets", "acme/other"] },
  choices: {
    codex: [{ value: "gpt-5.3-codex", label: "GPT-5.3 Codex", efforts: ["low", "high"] }],
  },
  listener: "none",
});

test("it says which folders Wake looks in, of those setup offers", () => {
  expect(json.folders).toEqual([
    { path: "/Users/ada/code", chosen: true },
    { path: "/Users/ada/Projects", chosen: false },
  ]);
});

test("each app once, with its agents, and each clone with the apps that asked for it", () => {
  expect(json.apps).toEqual([
    { domain: "gatherd.dev", agents: ["Claude", "Codex"] },
    { domain: "antescript.app", agents: ["Claude"] },
  ]);
  expect(json.clones[0]).toEqual({
    repo: "acme/gadgets",
    path: "/Users/ada/code/gadgets",
    askedBy: ["antescript.app", "gatherd.dev"],
  });
  expect(json.clones[1]?.askedBy).toEqual([]);
  expect(json.manyRepos).toBe(10);
});

test("herdr, runs and models are as setup would ask them", () => {
  expect(json.blocked).toBe(false);
  expect(json.herdr).toBe(true);
  expect(json.permissionModes.map((one) => one.mode)).toEqual(["acceptEdits", "auto", "dontAsk"]);
  expect(json.models.map((one) => one.tool)).toEqual(["claude", "codex"]);
  expect(json.models[1]?.choices[0]?.efforts).toEqual(["low", "high"]);
  expect(json.models[0]?.efforts).toContain("max");
});

test("a failed check blocks setup, and no key is ever in it", () => {
  const blocked = setupJson({
    machine: [{ level: "fail", what: "git not installed" }],
    config,
    folders: [],
    clones: [],
    asked: {},
    choices: {},
    listener: "wake",
  });
  expect(blocked.blocked).toBe(true);
  expect(JSON.stringify(blocked)).not.toContain("placeKey");
});
