// Which model each tool runs a summons with, and how hard it thinks. The
// person's choice on their machine, never the app's: a summons carries no
// text (the pattern's "What a run may do"), and the model is a matter of
// cost. With nothing chosen, no flag is passed and the tool's own default
// applies, the one the person gets at the keyboard.
import { homedir } from "node:os";
import { join } from "node:path";
import { AGENT_TOOLS, type AgentTool } from "./contract";
import type { Exec } from "./exec";
import type { Option } from "./prompt";
import { TOOL_NAMES } from "./tools";

export type ToolModel = { model?: string; effort?: string };
export type Models = Partial<Record<AgentTool, ToolModel>>;

/** Claude Code's aliases, which follow the newest model, so a choice never goes stale. */
export const CLAUDE_MODELS = ["opus", "sonnet", "fable", "haiku"] as const;
export const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
/** Codex's levels when its model list doesn't say a model's own. */
export const CODEX_EFFORTS = ["low", "medium", "high", "xhigh"] as const;

/**
 * A name each tool takes as one argument: never starting with a dash, so it
 * can't be read as a flag. Cursor's bracket overrides are allowed, as in
 * `claude-opus-4-8[effort=high]`.
 */
export function isModelName(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:/=,[\]-]{0,99}$/.test(v);
}

export function isEffort(v: unknown): v is string {
  return typeof v === "string" && /^[a-z]{2,16}$/.test(v);
}

/** Whether the tool takes an effort apart from its model; Cursor's model names carry it. */
export function takesEffort(tool: AgentTool): boolean {
  return tool !== "cursor";
}

/** The config's `models`, each entry on its own: a bad value drops itself. */
export function readModels(v: unknown): Models {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
  const out: Models = {};
  for (const tool of AGENT_TOOLS) {
    const entry: unknown = (v as Record<string, unknown>)[tool];
    if (typeof entry !== "object" || entry === null) continue;
    const { model, effort } = entry as Record<string, unknown>;
    const chosen: ToolModel = {
      ...(isModelName(model) ? { model } : {}),
      ...(isEffort(effort) && takesEffort(tool) ? { effort } : {}),
    };
    if (chosen.model || chosen.effort) out[tool] = chosen;
  }
  return out;
}

/** The tool's flags for the choice, the same headless and in herdr. */
export function modelArgs(tool: AgentTool, chosen: ToolModel | undefined): string[] {
  const model = isModelName(chosen?.model) ? chosen.model : undefined;
  const effort = isEffort(chosen?.effort) ? chosen.effort : undefined;
  switch (tool) {
    case "codex":
      return [
        ...(model ? ["-m", model] : []),
        // A TOML string, so Codex reads it as one whatever the word.
        ...(effort ? ["-c", `model_reasoning_effort="${effort}"`] : []),
      ];
    case "cursor":
      return model ? ["--model", model] : [];
    default:
      return [...(model ? ["--model", model] : []), ...(effort ? ["--effort", effort] : [])];
  }
}

/** The choice in words: `opus, high effort`, or the tool's own default. */
export function describeModel(tool: AgentTool, chosen: ToolModel | undefined): string {
  const model = chosen?.model ?? `${TOOL_NAMES[tool]}'s default`;
  return chosen?.effort ? `${model}, ${chosen.effort} effort` : model;
}

export type Listed = { value: string; label: string; efforts?: string[] };

/**
 * The models Codex lists, from the cache it keeps in ~/.codex. Not a promise
 * Codex makes, so anything unexpected reads as no list and setup asks for a
 * name instead.
 */
export async function codexModels(home = homedir()): Promise<Listed[]> {
  try {
    const raw: unknown = await Bun.file(join(home, ".codex", "models_cache.json")).json();
    const models = (raw as { models?: unknown }).models;
    if (!Array.isArray(models)) return [];
    return models.flatMap((one: unknown): Listed[] => {
      if (typeof one !== "object" || one === null) return [];
      const m = one as Record<string, unknown>;
      if (m.visibility !== "list" || !isModelName(m.slug)) return [];
      const levels = Array.isArray(m.supported_reasoning_levels)
        ? m.supported_reasoning_levels
            .map((level: unknown) => (level as { effort?: unknown } | null)?.effort)
            .filter(isEffort)
        : [];
      return [
        {
          value: m.slug,
          label: typeof m.display_name === "string" ? m.display_name : m.slug,
          ...(levels.length > 0 ? { efforts: levels } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}

/** The models `cursor-agent models` lists for the account, one `id - Label` a line. */
export async function cursorModels(run: Exec): Promise<Listed[]> {
  const result = await run(["cursor-agent", "models"]).catch(() => null);
  if (result?.code !== 0) return [];
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the escape is what is removed.
  const plain = result.stdout.replace(/\u001b\[[0-9;]*m/g, "");
  return plain.split("\n").flatMap((line): Listed[] => {
    const match = line.trim().match(/^(\S+)\s+-\s+(.+)$/);
    if (!match?.[1] || !match[2] || !isModelName(match[1])) return [];
    return [{ value: match[1], label: match[2].replace(/[​\s]+$/, "") }];
  });
}

/** What setup offers for a tool: its own default first, then its models. */
export async function modelChoices(tool: AgentTool, run: Exec, home?: string): Promise<Listed[]> {
  if (tool === "claude") return CLAUDE_MODELS.map((alias) => ({ value: alias, label: alias }));
  if (tool === "codex") return await codexModels(home);
  return await cursorModels(run);
}

/** The levels a model takes, as its tool says, else the tool's usual ones. */
export function effortChoices(tool: AgentTool, listed: Listed | undefined): string[] {
  if (!takesEffort(tool)) return [];
  if (listed?.efforts) return listed.efforts;
  return tool === "claude" ? [...CLAUDE_EFFORTS] : [...CODEX_EFFORTS];
}

export function asOptions(listed: Listed[]): Option<string>[] {
  return listed.map((one) => ({
    value: one.value,
    label: one.value,
    ...(one.label !== one.value ? { hint: one.label } : {}),
  }));
}
