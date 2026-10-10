/// <reference types="vite/client" />
// runs.forOwner: a person's agents' summonses, newest first, in a scope.
import { convexTest } from "convex-test";
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api.js";
import schema from "./schema.js";

const modules = import.meta.glob("./**/*.ts");

const ask = (subject: string, over: Record<string, unknown> = {}) => ({
  agent: "agent-1",
  owner: "ada",
  askedBy: "ada",
  scope: "w1",
  subject,
  kind: "mentioned",
  target: { kind: "thread", ref: `Page ${subject}`, url: `https://app.example.com/${subject}` },
  prompt: "Read the thread.",
  ...over,
});

test("newest first, in its scope, without the dropped or anyone else's", async () => {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  await t.mutation(api.summonses.summon, ask("a"));
  vi.advanceTimersByTime(1000);
  await t.mutation(api.summonses.summon, ask("b"));
  vi.advanceTimersByTime(1000);
  await t.mutation(api.summonses.summon, ask("c", { scope: "w2" }));
  await t.mutation(api.summonses.summon, ask("d", { owner: "bo", askedBy: "bo" }));
  vi.advanceTimersByTime(1000);
  await t.mutation(api.summonses.settle, {
    subject: "a",
    state: "dropped",
    reason: "Unassigned.",
  });
  const mine = await t.query(api.runs.forOwner, { owner: "ada", scope: "w1" });
  expect(mine.map((one) => [one.subject, one.target.ref, one.state])).toEqual([
    ["b", "Page b", "open"],
  ]);
  expect(await t.query(api.runs.forOwner, { owner: "ada" })).toHaveLength(2);
  expect(await t.query(api.runs.forOwner, { owner: "ada", limit: 1 })).toHaveLength(1);
  vi.useRealTimers();
});
