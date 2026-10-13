import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ClaudeRun, claudeArgs, rules } from "./claude";
import { askModels, model, nextModel } from "./commands/model";
import { defaults, loadConfig, saveConfig } from "./config";
import type { Exec } from "./exec";
import { nativeArgs } from "./herdr";
import {
  codexModels,
  cursorModels,
  describeModel,
  isModelName,
  modelArgs,
  readModels,
} from "./models";
import type { Io } from "./prompt";
import { codexArgs } from "./runners/codex";
import { cursorArgs } from "./runners/cursor";

const base: ClaudeRun = {
  cwd: "/repo/.claude/worktrees/gat-9-x",
  sessionId: "11111111-2222-4333-8444-555555555555",
  prompt: "Read GAT-9.",
  mcpServer: "gatherd",
  defaultBranch: "main",
  extraAllowedTools: [],
  timeoutMs: 60_000,
};

let home = "";
beforeAll(async () => {
  home = await mkdtemp(join(tmpdir(), "wake-models-"));
  process.env.WAKE_HOME = join(home, "wake");
  process.env.NO_COLOR = "1";
});
afterAll(async () => {
  delete process.env.WAKE_HOME;
  delete process.env.NO_COLOR;
  await rm(home, { recursive: true, force: true });
});

describe("a model name", () => {
  test("is one plain argument, never a flag", () => {
    expect(isModelName("opus")).toBe(true);
    expect(isModelName("gpt-5.3-codex-high")).toBe(true);
    expect(isModelName("claude-opus-4-8[effort=high,fast=false]")).toBe(true);
    expect(isModelName("--dangerously-skip-permissions")).toBe(false);
    expect(isModelName("-m")).toBe(false);
    expect(isModelName("opus; rm -rf ~")).toBe(false);
    expect(isModelName("")).toBe(false);
  });

  test("a bad entry in the config drops itself, and Cursor keeps no effort", () => {
    expect(
      readModels({
        claude: { model: "opus", effort: "high" },
        codex: { model: "--yolo", effort: "medium" },
        cursor: { model: "auto", effort: "high" },
        other: { model: "x" },
      }),
    ).toEqual({
      claude: { model: "opus", effort: "high" },
      codex: { effort: "medium" },
      cursor: { model: "auto" },
    });
    expect(readModels("opus")).toEqual({});
  });

  test("reads in words", () => {
    expect(describeModel("claude", { model: "opus", effort: "high" })).toBe("opus, high effort");
    expect(describeModel("codex", undefined)).toBe("Codex's default");
  });
});

describe("each tool's flags", () => {
  test("nothing chosen passes nothing, so the tool's default applies", () => {
    expect(modelArgs("claude", undefined)).toEqual([]);
    expect(claudeArgs(base)).not.toContain("--model");
    expect(codexArgs(base)).not.toContain("-m");
  });

  test("Claude Code headless and in herdr", () => {
    const model = { model: "opus", effort: "high" };
    expect(claudeArgs({ ...base, model }).join(" ")).toContain("--model opus --effort high");
    expect(nativeArgs({ ...base, model }, "/s.json").join(" ")).toContain(
      "--model opus --effort high",
    );
  });

  test("Codex, before the dash that reads the prompt", () => {
    const args = codexArgs({ ...base, model: { model: "gpt-6.1-sol", effort: "xhigh" } });
    expect(args.join(" ")).toContain('-m gpt-6.1-sol -c model_reasoning_effort="xhigh" -');
    expect(args.at(-1)).toBe("-");
    const live = nativeArgs({ ...base, tool: "codex", model: { model: "gpt-6.1-sol" } }, "x");
    expect(live.slice(-2)).toEqual(["-m", "gpt-6.1-sol"]);
  });

  test("Cursor, with the prompt still last", () => {
    const args = cursorArgs({ ...base, model: { model: "composer-2.5" } });
    expect(args.join(" ")).toContain("--model composer-2.5 --workspace");
    expect(args.at(-1)?.endsWith(base.prompt)).toBe(true);
  });

  test("the signature names the tool and the chosen model", () => {
    expect(rules({ ...base, tool: "codex", model: { model: "gpt-6.1-sol" } })).toContain(
      "— Codex (gpt-6.1-sol) via Wake",
    );
    expect(rules(base)).toContain("— Claude Code (your model) via Wake");
  });
});

describe("the lists setup offers", () => {
  test("Codex's own cache, listed models only, with their levels", async () => {
    await mkdir(join(home, ".codex"), { recursive: true });
    await writeFile(
      join(home, ".codex", "models_cache.json"),
      JSON.stringify({
        models: [
          {
            slug: "gpt-6.1-sol",
            display_name: "GPT-6.1-Sol",
            visibility: "list",
            supported_reasoning_levels: [{ effort: "low" }, { effort: "max" }],
          },
          { slug: "hidden", visibility: "hide" },
          { slug: "--bad", visibility: "list" },
        ],
      }),
    );
    expect(await codexModels(home)).toEqual([
      { value: "gpt-6.1-sol", label: "GPT-6.1-Sol", efforts: ["low", "max"] },
    ]);
    expect(await codexModels(join(home, "nowhere"))).toEqual([]);
  });

  test("cursor-agent models, read past its colours", async () => {
    const run: Exec = async () => ({
      code: 0,
      stdout:
        "\u001b[1mAvailable models\u001b[0m\n\nauto - Auto (default)\ncomposer-2.5 - Composer 2.5\n",
      stderr: "",
    });
    expect(await cursorModels(run)).toEqual([
      { value: "auto", label: "Auto (default)" },
      { value: "composer-2.5", label: "Composer 2.5" },
    ]);
    expect(await cursorModels(async () => ({ code: 1, stdout: "", stderr: "" }))).toEqual([]);
  });
});

describe("wakectl model", () => {
  const none: Exec = async () => ({ code: 1, stdout: "", stderr: "" });

  test("sets, keeps and clears a tool's choice", async () => {
    await model("claude", "opus", "high", none);
    expect((await loadConfig()).models.claude).toEqual({ model: "opus", effort: "high" });
    await model("claude", "sonnet", undefined, none);
    expect((await loadConfig()).models.claude).toEqual({ model: "sonnet", effort: "high" });
    await model("claude", "default", "default", none);
    expect((await loadConfig()).models.claude).toBeUndefined();
  });

  test("refuses what a tool wouldn't take", async () => {
    expect(() => nextModel("claude", undefined, "--yolo", undefined)).toThrow("isn't a model");
    expect(() => nextModel("claude", undefined, undefined, "ultra")).toThrow("one of low");
    expect(() => nextModel("cursor", undefined, undefined, "high")).toThrow("in the name");
    expect(nextModel("codex", undefined, undefined, "ultra")).toEqual({ effort: "ultra" });
    await expect(model("gemini", "x", undefined, none)).rejects.toThrow("usage");
  });
});

/** A terminal that gives these answers in order. */
function scripted(answers: string[]): Io {
  return { ask: async () => answers.shift() ?? "", say: () => {}, close: () => {} };
}

test("setup asks once for each tool the pairings run on", async () => {
  const pairing = (tool: "claude" | "cursor") => ({
    domain: "app.example.com",
    app: "example",
    agent: { id: tool, name: tool, tool },
    httpBase: "https://h",
    pairedAt: 1,
    tool,
  });
  const config = {
    ...defaults(),
    models: { codex: { model: "gpt-6.1-sol" } },
    apps: { a: pairing("claude"), b: pairing("claude"), c: pairing("cursor") },
  };
  const cursor: Exec = async () => ({
    code: 0,
    stdout: "auto - Auto\ncomposer-2.5 - Composer 2.5\n",
    stderr: "",
  });
  const next = await askModels(
    scripted([
      "2", // Claude Code: opus (after its own default)
      "4", // effort: high (after its default, low, medium)
      "4", // Cursor: something else
      "-x", // not a model name, so asked again
      "my-model[effort=high]",
    ]),
    cursor,
    config,
    home,
  );
  expect(next.models).toEqual({
    claude: { model: "opus", effort: "high" },
    codex: { model: "gpt-6.1-sol" },
    cursor: { model: "my-model[effort=high]" },
  });
  await saveConfig(next);
  // Run again, Enter keeps each answer as it is.
  expect((await askModels(scripted([]), cursor, next, home)).models).toEqual(next.models);
});
