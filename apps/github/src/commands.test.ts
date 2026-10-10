import { expect, test } from "bun:test";
import { askedByLabel, askedInText } from "./commands";

test("the wake label, with or without a tool", () => {
  expect(askedByLabel("wake")).toEqual({});
  expect(askedByLabel("Wake:Codex")).toEqual({ tool: "codex" });
  expect(askedByLabel("wake: cursor")).toEqual({ tool: "cursor" });
  expect(askedByLabel("bug")).toBeNull();
  expect(askedByLabel("wakeful")).toBeNull();
});

test("/wake on its own line, not quoted, not in code", () => {
  expect(askedInText("/wake")).toEqual({});
  expect(askedInText("Looks wrong.\n/wake codex\nthanks")).toEqual({ tool: "codex" });
  expect(askedInText("/wake please fix the flaky test")).toEqual({});
  expect(askedInText("> /wake\nI disagree")).toBeNull();
  expect(askedInText("```\n/wake\n```")).toBeNull();
  expect(askedInText("try /wake later")).toBeNull();
  expect(askedInText("/wakeful")).toBeNull();
});
