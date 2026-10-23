// What both Drizzle stores share: Drizzle answers null for an empty column,
// and the store's rows leave it out.

export function present<T extends Record<string, unknown>>(
  row: T,
): { [K in keyof T]: Exclude<T[K], null> } {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) if (value !== null) out[key] = value;
  return out as { [K in keyof T]: Exclude<T[K], null> };
}
