/// <reference types="vite/client" />
// For a host's own convex-test suite:
//
//   import wake from "@abyssinia-labs/wake-convex/test";
//   const t = convexTest(schema, modules);
//   wake.register(t);

import type { GenericSchema, SchemaDefinition } from "convex/server";
import type { TestConvex } from "convex-test";
import schema from "./component/schema.js";

const modules = import.meta.glob("./component/**/*.ts");

export function register<Schema extends SchemaDefinition<GenericSchema, boolean>>(
  t: TestConvex<Schema>,
  name = "wake",
): void {
  t.registerComponent(name, schema, modules);
}

export default { register, schema, modules };
