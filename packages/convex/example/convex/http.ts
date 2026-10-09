import { httpRouter } from "convex/server";
import { registerRoutes } from "../../src/client/index.js";
import { components } from "./_generated/api.js";

const http = httpRouter();
// This example's domain is its Convex site, so it serves discovery too.
const convexUrl = process.env.CONVEX_CLOUD_URL ?? "";
const httpBase = process.env.CONVEX_SITE_URL ?? "";
registerRoutes(http, components.wake, {
  app: "example",
  keyPrefix: "ex_",
  discovery: { convexUrl, httpBase },
});
export default http;
