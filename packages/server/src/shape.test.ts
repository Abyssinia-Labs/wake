// The watch calls' rules (the spec's "Devices that watch"): what a device may send.
import { describe, expect, test } from "bun:test";
import { isDevice, isPush, isPushToken, NOT_IN_PLAN } from "./shape";

const hex = "8d3f".repeat(16);
const apns = { token: hex, environment: "production" };
const webPush = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) },
};

describe("a device", () => {
  test("is named for its owner's list, on a platform the spec knows", () => {
    expect(isDevice({ name: "Ada's iPhone", platform: "ios" })).toBe(true);
    expect(isDevice({ name: "Firefox", platform: "web" })).toBe(true);
    expect(isDevice({ name: "Ada's iPhone", platform: "android" })).toBe(false);
    expect(isDevice({ name: "", platform: "ios" })).toBe(false);
    expect(isDevice({ name: "Phone\u001b[2J", platform: "ios" })).toBe(false);
    expect(isDevice({ name: "x".repeat(101), platform: "darwin" })).toBe(false);
  });
});

describe("wake:push", () => {
  test("a phone or a Mac gives APNs, and a Live Activity's start token if it likes", () => {
    expect(isPush({ kinds: ["ask", "failed"], apns }, "ios")).toBe(true);
    const live = { pushToStartToken: hex };
    expect(isPush({ kinds: [], apns, liveActivity: live }, "darwin")).toBe(true);
    expect(isPush({ kinds: [], apns: { ...apns, environment: "staging" } }, "ios")).toBe(false);
    expect(isPush({ kinds: [], apns: { ...apns, token: "not hex" } }, "ios")).toBe(false);
    expect(isPush({ kinds: [], apns, liveActivity: { pushToStartToken: "?" } }, "ios")).toBe(false);
  });
  test("a browser gives a Web Push subscription, over https", () => {
    expect(isPush({ kinds: ["ask"], webPush }, "web")).toBe(true);
    for (const endpoint of ["http://localhost:8080/push", "https://u:p@push.example", "nope"]) {
      expect(isPush({ kinds: ["ask"], webPush: { ...webPush, endpoint } }, "web")).toBe(false);
    }
    const keys = { ...webPush.keys, auth: "short" };
    expect(isPush({ kinds: ["ask"], webPush: { ...webPush, keys } }, "web")).toBe(false);
  });
  test("only the way its platform has, and only kinds the spec names, once each", () => {
    expect(isPush({ kinds: ["ask"], apns }, "web")).toBe(false);
    expect(isPush({ kinds: ["ask"], webPush }, "ios")).toBe(false);
    expect(isPush({ kinds: ["ask"], apns, webPush }, "ios")).toBe(false);
    expect(isPush({ kinds: ["ask"] }, "ios")).toBe(false);
    expect(isPush({ kinds: ["ask"], apns }, "linux")).toBe(false);
    expect(isPush({ kinds: ["ask", "ask"], apns }, "ios")).toBe(false);
    expect(isPush({ kinds: ["comment"], apns }, "ios")).toBe(false);
  });
  test("a running Live Activity's own token is hex too", () => {
    expect(isPushToken(hex)).toBe(true);
    expect(isPushToken("8d3f")).toBe(false);
  });
});

test("the plan's word is the spec's", () => {
  expect(NOT_IN_PLAN).toBe("not-in-plan");
});
