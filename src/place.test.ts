import { describe, expect, test } from "bun:test";
import { tokenSource } from "./place";

describe("tokenSource", () => {
  test("reuses a token until five minutes before it expires, or when forced", async () => {
    let now = 0;
    let fetched = 0;
    const token = tokenSource(
      { httpBase: "https://h" },
      "k",
      async () => {
        fetched += 1;
        return { token: `t${fetched}`, expiresAt: now + 60 * 60_000 };
      },
      () => now,
    );
    expect(await token(false)).toBe("t1");
    now = 50 * 60_000;
    expect(await token(false)).toBe("t1");
    now = 56 * 60_000;
    expect(await token(false)).toBe("t2");
    expect(await token(true)).toBe("t3");
  });
});
