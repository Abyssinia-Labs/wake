import { expect, test } from "bun:test";
import { type SseEvent, sseParser } from "./sse";

test("events across chunks, comments ignored, retry honoured", () => {
  const events: SseEvent[] = [];
  const retries: number[] = [];
  const parser = sseParser(
    (event) => events.push(event),
    (ms) => retries.push(ms),
  );
  parser.push("retry: 2500\n: ping\n\nevent: pend");
  parser.push('ing\ndata: [{"id":"a"}]\n\n');
  parser.push("data: one\r\ndata: two\r\n\r\n");
  expect(retries).toEqual([2500]);
  expect(events).toEqual([
    { event: "pending", data: '[{"id":"a"}]' },
    { event: "message", data: "one\ntwo" },
  ]);
});

test("an event without data dispatches nothing", () => {
  const events: SseEvent[] = [];
  const parser = sseParser((event) => events.push(event));
  parser.push("event: pending\n\n");
  expect(events).toEqual([]);
});
