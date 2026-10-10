// Server-sent events, as the HTTP transport's `pending` stream sends them
// (the spec's "The HTTP transport"): `event:` and `data:` lines, a blank
// line to dispatch, `retry:` for the reconnect delay, `:` for comments.
// Pure, fed chunks of text as they arrive, so it is tested on its own.

export type SseEvent = { event: string; data: string };

export type SseParser = {
  /** Feed text as it arrives; whole events go to `onEvent`. */
  push(chunk: string): void;
};

export function sseParser(
  onEvent: (event: SseEvent) => void,
  onRetry: (ms: number) => void = () => undefined,
): SseParser {
  let buffer = "";
  let event = "";
  let data: string[] = [];
  const line = (text: string): void => {
    if (text === "") {
      if (data.length > 0) onEvent({ event: event || "message", data: data.join("\n") });
      event = "";
      data = [];
      return;
    }
    if (text.startsWith(":")) return;
    const colon = text.indexOf(":");
    const field = colon === -1 ? text : text.slice(0, colon);
    const value = colon === -1 ? "" : text.slice(colon + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "retry" && /^\d+$/.test(value)) onRetry(Number(value));
  };
  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split(/\r\n|\r|\n/);
      buffer = lines.pop() ?? "";
      for (const one of lines) line(one);
    },
  };
}
