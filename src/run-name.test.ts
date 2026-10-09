import { expect, test } from "bun:test";
import { runName } from "./run-name";

test("a run's name is two words the spec allows, and the same for the same id", () => {
  const id = "04276cdc-3e6b-41f9-9e6c-30e72b13715e";
  expect(runName(id)).toMatch(/^[a-z]{1,16}-[a-z]{1,16}$/);
  expect(runName(id)).toBe(runName(id));
  const names = new Set(Array.from({ length: 200 }, () => runName(crypto.randomUUID())));
  expect(names.size).toBeGreaterThan(150);
});
