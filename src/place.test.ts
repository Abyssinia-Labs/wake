import { describe, expect, test } from "bun:test";
import { ConvexError } from "convex/values";
import { isUnpairedError } from "./place";

describe("isUnpairedError", () => {
  test("the app's UNPAIRED, as a ConvexError or as the message a client relays", () => {
    expect(isUnpairedError(new ConvexError("UNPAIRED"))).toBe(true);
    expect(
      isUnpairedError(new Error("[Request ID: x] Server Error Uncaught ConvexError: UNPAIRED")),
    ).toBe(true);
  });
  test("anything else is a failure to report, not a forgotten place", () => {
    expect(isUnpairedError(new ConvexError("TICKET_NOT_FOUND"))).toBe(false);
    expect(isUnpairedError(new Error("WebSocket closed"))).toBe(false);
  });
});
