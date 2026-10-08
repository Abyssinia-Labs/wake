// What a run is doing, one line per step, from Claude Code's stream-json
// output: so `wakectl logs -f` follows a run as it goes rather than saying
// nothing between "Started" and "Finished". Pure, so it is tested alone.

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function oneLine(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** A tool call as a person reads it: the tool, and the one argument that says what. */
function toolLine(name: string, input: unknown): string {
  const args = isRecord(input) ? input : {};
  const pick = (key: string): string | undefined =>
    typeof args[key] === "string" ? (args[key] as string) : undefined;
  const what =
    pick("command") ??
    pick("file_path")?.split("/").at(-1) ??
    pick("pattern") ??
    pick("key") ??
    pick("url") ??
    pick("description");
  const tool = name.startsWith("mcp__") ? name.split("__").slice(2).join("__") || name : name;
  return what ? `${tool}: ${oneLine(what, 100)}` : tool;
}

/** One stream-json line as a log line, or null for what is not worth a line. */
export function describeEvent(line: string): string | null {
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return null;
  }
  if (!isRecord(event)) return null;
  if (event.type === "system" && event.subtype === "init") {
    return typeof event.model === "string" ? `began (${event.model})` : "began";
  }
  if (event.type === "result") {
    const turns = typeof event.num_turns === "number" ? ` after ${event.num_turns} turns` : "";
    return event.is_error === true ? `stopped with an error${turns}` : `finished${turns}`;
  }
  if (event.type !== "assistant" || !isRecord(event.message)) return null;
  const parts = Array.isArray(event.message.content) ? event.message.content : [];
  const lines: string[] = [];
  for (const part of parts) {
    if (!isRecord(part)) continue;
    if (part.type === "tool_use" && typeof part.name === "string") {
      lines.push(toolLine(part.name, part.input));
    } else if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
      lines.push(`said: ${oneLine(part.text, 140)}`);
    }
  }
  return lines.length > 0 ? lines.join(" · ") : null;
}

/** The stream's last `result` event, which says whether the run failed and why. */
export function resultOf(line: string): Record<string, unknown> | null {
  try {
    const event: unknown = JSON.parse(line);
    return isRecord(event) && event.type === "result" ? event : null;
  } catch {
    return null;
  }
}
