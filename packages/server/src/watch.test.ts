// The watch calls (the spec's "Devices that watch"): a watch key opens only
// them, a place key none of them, an ask waits for the owner's yes, and
// what a device sees carries no text. On Postgres and on SQLite.
import { describe, expect, test } from "bun:test";
import { ask, pairedKey, STORES, testWake, watchKey } from "./test-db";
import type { Plan } from "./wire";

const hex = "8d3f".repeat(16);

for (const kind of STORES) {
  describe(kind, () => {
    test("a watch code makes one device; pair codes and watch codes open only their own door", async () => {
      const { wake } = await testWake(kind);
      const owner = {
        agent: "agent-1",
        agentName: "Claude",
        owner: "ada",
        tool: "claude" as const,
      };
      const device = { name: "Ada's iPhone", platform: "ios" as const };
      const { code } = await wake.issueWatchCode(owner);
      await expect(wake.pair({ code, machine: { name: "m", platform: "darwin" } })).rejects.toThrow(
        "CODE_INVALID",
      );
      const watched = await wake.watch({ code: code.toLowerCase().replace("-", ""), device });
      expect(watched).toEqual({
        watchKey: expect.stringMatching(/^ak_[0-9a-f]{64}$/),
        app: "acme",
        agent: { id: "agent-1", name: "Claude", tool: "claude" },
      });
      await expect(wake.watch({ code, device })).rejects.toThrow("CODE_INVALID");
      const pairCode = await wake.issueCode(owner);
      await expect(wake.watch({ code: pairCode.code, device })).rejects.toThrow("CODE_INVALID");
      expect(await wake.devices("agent-1")).toEqual([
        { id: expect.any(String), ...device, madeAt: expect.any(Number), alerts: [] },
      ]);
    });

    test("a place key opens no watch call, and a watch key no place call", async () => {
      const { wake } = await testWake(kind);
      const place = await pairedKey(wake);
      const device = await watchKey(wake);
      const id = await wake.summon(ask());
      const calls = wake.watchCalls;
      for (const call of [
        () => calls.runs(place),
        () => calls.places(place),
        () => calls.watching(place),
        () => calls.answer(place, id, true),
        () =>
          calls.push(place, { kinds: ["ask"], apns: { token: hex, environment: "production" } }),
        () => calls.activity(place, id, hex),
        () => wake.pending(device),
        () => wake.claim(device, id),
        () => wake.started(device, id, { name: "amber-heron", tool: "claude" }),
        () => wake.waiting(device, id, true),
        () => wake.finish(device, id, "failed"),
      ]) {
        await expect(call()).rejects.toThrow("UNPAIRED");
      }
    });

    test("an ask is the owner's to answer: invisible to places until a yes", async () => {
      const { wake } = await testWake(kind);
      const place = await pairedKey(wake);
      const device = await watchKey(wake);
      const other = await watchKey(wake, "ios", "agent-2");
      const id = await wake.summon(ask({ askedBy: "grace", askerName: "Grace" }));
      expect(await wake.pending(place)).toEqual([]);
      expect(await wake.claim(place, id)).toEqual({ claimed: false });
      const [asking] = await wake.watchCalls.runs(device);
      expect(asking).toMatchObject({ id, state: "asking", asker: { name: "Grace" } });
      await wake.watchCalls.answer(other, id, true);
      expect(await wake.pending(place)).toEqual([]);
      await wake.watchCalls.answer(device, id, true);
      expect(await wake.pending(place)).toHaveLength(1);
      const [open] = await wake.watchCalls.runs(device);
      expect([open?.state, open?.asker]).toEqual(["open", undefined]);
      const no = await wake.summon(ask({ subject: "ticket-2", askedBy: "grace" }));
      await wake.watchCalls.answer(device, no, false);
      const [dropped] = await wake.watchCalls.runs(device);
      expect(dropped).toMatchObject({ id: no, state: "dropped", reason: "The owner said no." });
      expect(dropped?.endedAt).toEqual(expect.any(Number));
      expect(dropped?.asker).toBeUndefined();
    });

    test("a run, newest first, with its place, its wait and its end; never the prompt", async () => {
      const { wake, advance } = await testWake(kind);
      const place = await pairedKey(wake, "Ada's\u001b[2J Mac");
      const device = await watchKey(wake);
      const id = await wake.summon(ask());
      await wake.claim(place, id);
      await wake.started(place, id, { name: "amber-heron", tool: "claude", session: "s-1" });
      await wake.waiting(place, id, true);
      advance(1000);
      const later = await wake.summon(ask({ subject: "ticket-2" }));
      const [first, second] = await wake.watchCalls.runs(device);
      expect(first?.id).toBe(later);
      expect(second).toEqual({
        id,
        app: "acme",
        kind: "assigned",
        target: ask().target,
        repo: "acme/widgets",
        branch: "acme-1-fix",
        at: expect.any(Number),
        state: "claimed",
        run: { name: "amber-heron", tool: "claude", session: "s-1", startedAt: expect.any(Number) },
        place: { name: "Ada's[2J Mac" },
        waiting: true,
      });
      expect((await wake.forSubject("ticket-1"))[0]?.waiting).toBe(true);
      await wake.waiting(place, id, false);
      await wake.finish(place, id, "done", "Opened a pull request.");
      const runs = await wake.watchCalls.runs(device);
      expect(runs[1]).toMatchObject({ state: "done", reason: "Opened a pull request." });
      expect(runs[1]?.waiting).toBeUndefined();
      expect(JSON.stringify(runs)).not.toContain("getticket");
    });

    test("places: not forgotten, most recently paired first, with their last claim", async () => {
      const { wake, advance } = await testWake(kind);
      const studio = await pairedKey(wake, "studio");
      advance(1000);
      await pairedKey(wake, "laptop");
      const gone = await pairedKey(wake, "gone");
      await wake.forget(gone);
      const device = await watchKey(wake);
      await wake.claim(studio, await wake.summon(ask()));
      const places = await wake.watchCalls.places(device);
      expect(places.map((one) => one.name)).toEqual(["laptop", "studio"]);
      expect(places[0]?.lastClaimAt).toBeUndefined();
      expect(places[1]).toEqual({
        name: "studio",
        platform: "darwin",
        pairedAt: expect.any(Number),
        lastClaimAt: expect.any(Number),
      });
    });

    test("without devices in the plan, every watch call but watching is NOT_IN_PLAN", async () => {
      let plan: Plan = { devices: "included", alerts: "not-in-plan" };
      const { wake } = await testWake(kind, { plan: () => plan });
      const device = await watchKey(wake);
      const id = await wake.summon(ask());
      plan = { devices: "not-in-plan", alerts: "not-in-plan" };
      const calls = wake.watchCalls;
      for (const call of [
        () => calls.runs(device),
        () => calls.places(device),
        () => calls.answer(device, id, true),
        () => calls.push(device, { kinds: [] }),
        () => calls.activity(device, id, hex),
        () => wake.issueWatchCode({ agent: "agent-1", agentName: "Claude", owner: "ada" }),
      ]) {
        await expect(call()).rejects.toThrow("NOT_IN_PLAN");
      }
      expect(await calls.watching(device)).toEqual({
        app: "acme",
        agent: { id: "agent-1", name: "Claude", tool: "claude" },
        devices: "not-in-plan",
        alerts: "not-in-plan",
      });
      // A key that opens nothing is UNPAIRED first; forget still forgets.
      await expect(calls.runs(`ak_${"0".repeat(64)}`)).rejects.toThrow("UNPAIRED");
      expect(await wake.forget(device)).toBe(true);
      await expect(calls.watching(device)).rejects.toThrow("UNPAIRED");
    });

    test("removing, revoking or deleting the scope closes a watch key", async () => {
      const { wake } = await testWake(kind);
      const one = await watchKey(wake);
      const [listed] = await wake.devices("agent-1");
      expect(await wake.forgetDevice({ agent: "agent-2", device: listed?.id ?? "" })).toBe(false);
      expect(await wake.forgetDevice({ agent: "agent-1", device: listed?.id ?? "" })).toBe(true);
      await expect(wake.watchCalls.watching(one)).rejects.toThrow("UNPAIRED");
      expect(await wake.devices("agent-1")).toEqual([]);
      const two = await watchKey(wake);
      const { code } = await wake.issueWatchCode({
        agent: "agent-1",
        agentName: "C",
        owner: "ada",
      });
      await wake.revokeAgent("agent-1");
      await expect(wake.watchCalls.watching(two)).rejects.toThrow("UNPAIRED");
      const device = { name: "x", platform: "web" as const };
      await expect(wake.watch({ code, device })).rejects.toThrow("CODE_INVALID");
      const three = await watchKey(wake, "web", "agent-3");
      let done = false;
      while (!done) ({ done } = await wake.deleteScope("w1"));
      await expect(wake.watchCalls.watching(three)).rejects.toThrow("UNPAIRED");
      expect(await wake.forget(three)).toBe(false);
    });
  });
}
