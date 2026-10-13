// `wakectl model [tool] [name|default] [--effort level|default]`: the model
// and effort each tool runs a summons with. Written to the config the
// listener reads on every run, so the next run uses it with no restart.
import { type Config, loadConfig, saveConfig } from "../config";
import { AGENT_TOOLS, type AgentTool } from "../contract";
import { type Exec, exec } from "../exec";
import { say } from "../log";
import {
  asOptions,
  CLAUDE_EFFORTS,
  describeModel,
  effortChoices,
  isEffort,
  isModelName,
  modelChoices,
  type ToolModel,
  takesEffort,
} from "../models";
import { choose, type Io, type Option, text } from "../prompt";
import { pairedTools, TOOL_NAMES } from "../tools";
import { bold, cyan, dim, mark, pad } from "../ui";

const USAGE = "usage: wakectl model [claude|codex|cursor] [name|default] [--effort level|default]";

export function modelLines(config: Config): string[] {
  return AGENT_TOOLS.map(
    (tool) =>
      `  ${pad(dim(TOOL_NAMES[tool]), 14)}${config.models[tool] ? describeModel(tool, config.models[tool]) : dim(describeModel(tool, undefined))}`,
  );
}

/** The choice after `name` and `effort`, either of which may be `default` to clear it. */
export function nextModel(
  tool: AgentTool,
  now: ToolModel | undefined,
  name: string | undefined,
  effort: string | undefined,
): ToolModel {
  const next: ToolModel = { ...now };
  if (name === "default") delete next.model;
  else if (name !== undefined) {
    if (!isModelName(name)) throw new Error(`"${name}" isn't a model name ${tool} would take.`);
    next.model = name;
  }
  if (effort === "default") delete next.effort;
  else if (effort !== undefined) {
    if (!takesEffort(tool)) {
      throw new Error(
        "Cursor's models carry their effort in the name, as gpt-5.3-codex-high: pick one of those.",
      );
    }
    if (tool === "claude" && !(CLAUDE_EFFORTS as readonly string[]).includes(effort)) {
      throw new Error(`effort for Claude Code is one of ${CLAUDE_EFFORTS.join(", ")}`);
    }
    // Codex's levels differ by model; its list is checked after saving.
    if (!isEffort(effort)) throw new Error(`effort is a word such as high, not "${effort}"`);
    next.effort = effort;
  }
  return next;
}

/** A word on a choice the tool's own list doesn't have; the run still tries it. */
async function unlisted(tool: AgentTool, chosen: ToolModel, run: Exec): Promise<string | null> {
  if (tool === "claude" || !chosen.model) return null;
  const listed = await modelChoices(tool, run);
  if (listed.length === 0) return null;
  const match = listed.find((one) => one.value === chosen.model);
  // Cursor's bracket overrides make a name the list can't show.
  if (!match && !chosen.model.includes("[")) {
    return `${TOOL_NAMES[tool]} doesn't list ${chosen.model} for you; a run on it may fail. ${tool === "cursor" ? "cursor-agent models" : "/model in Codex"} shows what it has.`;
  }
  const levels = effortChoices(tool, match);
  if (chosen.effort && match?.efforts && !levels.includes(chosen.effort)) {
    return `${chosen.model} takes ${levels.join(", ")} for effort, not ${chosen.effort}.`;
  }
  return null;
}

export async function model(
  tool: string | undefined,
  name: string | undefined,
  effort: string | undefined,
  run: Exec = exec,
): Promise<void> {
  const config = await loadConfig();
  if (tool === undefined) {
    say(bold("Models runs use"));
    for (const line of modelLines(config)) say(line);
    say(dim(`  Change one with ${cyan("wakectl model claude opus --effort high")}.`));
    return;
  }
  const chosenTool = AGENT_TOOLS.find((one) => one === tool);
  if (!chosenTool) throw new Error(USAGE);
  if (name === undefined && effort === undefined) {
    say(
      `${TOOL_NAMES[chosenTool]} runs use ${bold(describeModel(chosenTool, config.models[chosenTool]))}`,
    );
    return;
  }
  const next = nextModel(chosenTool, config.models[chosenTool], name, effort);
  const models = { ...config.models };
  if (next.model || next.effort) models[chosenTool] = next;
  else delete models[chosenTool];
  await saveConfig({ ...config, models });
  say(
    `${mark.ok()} ${TOOL_NAMES[chosenTool]} runs use ${bold(describeModel(chosenTool, models[chosenTool]))}`,
  );
  const note = await unlisted(chosenTool, next, run);
  if (note) say(`${mark.warn()} ${note}`);
}

// Neither is a model name (isModelName), so neither is mistaken for one.
const OWN = "";
const OTHER = "…";

async function typedName(io: Io): Promise<string> {
  for (;;) {
    const typed = await text(io, "Its name, as the tool takes it (or Enter for the default):");
    if (!typed || isModelName(typed)) return typed;
    io.say(`${mark.warn()} That isn't a model name the tool would take.`);
  }
}

async function askOne(
  io: Io,
  run: Exec,
  tool: AgentTool,
  now: ToolModel | undefined,
  home?: string,
): Promise<ToolModel> {
  const listed = await modelChoices(tool, run, home);
  const kept = now?.model && !listed.some((one) => one.value === now.model) ? [now.model] : [];
  const options: Option<string>[] = [
    {
      value: OWN,
      label: `${TOOL_NAMES[tool]}'s own default`,
      hint: "what you get at the keyboard",
    },
    ...asOptions(listed),
    ...kept.map((name) => ({ value: name, label: name, hint: "chosen before" })),
    { value: OTHER, label: "Something else", hint: "type its name" },
  ];
  const at = options.findIndex((one) => one.value === (now?.model ?? OWN));
  let name = await choose(
    io,
    `Which model should ${TOOL_NAMES[tool]} runs use?`,
    options,
    Math.max(at, 0),
  );
  if (name === OTHER) name = await typedName(io);
  const levels = effortChoices(
    tool,
    listed.find((one) => one.value === name),
  );
  let effort = "";
  if (levels.length > 0) {
    const efforts: Option<string>[] = [
      { value: OWN, label: "Its default" },
      ...levels.map((level) => ({ value: level, label: level })),
    ];
    const was = efforts.findIndex((one) => one.value === (now?.effort ?? OWN));
    effort = await choose(io, "How hard should it think?", efforts, Math.max(was, 0));
  }
  return { ...(name ? { model: name } : {}), ...(effort ? { effort } : {}) };
}

/** Setup's question, once for each tool a pairing runs on. */
export async function askModels(io: Io, run: Exec, config: Config, home?: string): Promise<Config> {
  const models = { ...config.models };
  for (const tool of pairedTools(config)) {
    const chosen = await askOne(io, run, tool, models[tool], home);
    if (chosen.model || chosen.effort) models[tool] = chosen;
    else delete models[tool];
  }
  return { ...config, models };
}
