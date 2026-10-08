import { describe, expect, test } from "bun:test";
import { describeEvent, resultOf } from "./claude-events";

const assistant = (content: unknown[]): string =>
  JSON.stringify({ type: "assistant", message: { content } });

describe("describeEvent", () => {
  test("a tool call is the tool and what it acts on", () => {
    expect(
      describeEvent(
        assistant([{ type: "tool_use", name: "Read", input: { file_path: "/a/b/zeptomail.ts" } }]),
      ),
    ).toBe("Read: zeptomail.ts");
    expect(
      describeEvent(
        assistant([{ type: "tool_use", name: "Bash", input: { command: "git log\n-8" } }]),
      ),
    ).toBe("Bash: git log -8");
    expect(
      describeEvent(
        assistant([
          { type: "tool_use", name: "mcp__gatherd__getticket", input: { key: "GAT-37" } },
        ]),
      ),
    ).toBe("getticket: GAT-37");
  });

  test("what it says is cut to one line", () => {
    const long = `Looks right.\n${"x".repeat(300)}`;
    const line = describeEvent(assistant([{ type: "text", text: long }])) ?? "";
    expect(line.startsWith("said: Looks right. x")).toBe(true);
    expect(line.length).toBeLessThanOrEqual(146);
  });

  test("the start and the end; everything else is quiet", () => {
    expect(describeEvent(JSON.stringify({ type: "result", is_error: true, num_turns: 3 }))).toBe(
      "stopped with an error after 3 turns",
    );
    expect(describeEvent(JSON.stringify({ type: "user", message: {} }))).toBeNull();
    expect(describeEvent("not json")).toBeNull();
  });
});

describe("resultOf", () => {
  test("only a result event", () => {
    expect(resultOf(JSON.stringify({ type: "result", result: "ok" }))).toEqual({
      type: "result",
      result: "ok",
    });
    expect(resultOf(JSON.stringify({ type: "assistant" }))).toBeNull();
  });
});
