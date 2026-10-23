// The functions Wake calls, and the ones a device that watches calls, under
// the names wake/v1 gives them.
import { exposeApi, exposeWatchApi } from "../../src/client/index.js";
import { components } from "./_generated/api.js";

export const { pending, claim, started, finish, waiting } = exposeApi(components.wake, {
  app: "example",
});
// The example has no plans, so devices and alerts are included.
export const { runs, answer, places, watching, push, activity } = exposeWatchApi(components.wake, {
  app: "example",
});
