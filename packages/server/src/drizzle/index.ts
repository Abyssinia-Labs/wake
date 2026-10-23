// `@abyssinia-labs/wake-server/drizzle`: the tables and the store, for an
// app on Postgres with Drizzle.

export {
  WAKE_TABLES_SQL,
  wakeCodes,
  wakeDevices,
  wakePlaces,
  wakeSummonses,
  wakeWatchCodes,
} from "./schema";
export { drizzleStore } from "./store";
