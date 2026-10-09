// The three functions Wake calls, under the names wake/v1 gives them.
import { exposeApi } from "../../src/client/index.js";
import { components } from "./_generated/api.js";

export const { pending, claim, finish } = exposeApi(components.wake, { app: "example" });
