# Changelog

What changed in `@abyssinia-labs/wake-server`, newest first, for an app
that serves wake/v1 over HTTP. What changed in `wakectl` is in
[its own changelog](../../CHANGELOG.md).

## Unreleased

### Added

- **wake/v1 has calls for devices that watch, which this server doesn't serve yet.** The spec adds
  a watch key, which an agent's owner trades for a code your app shows them, and the calls it
  opens, for a phone or a browser that lists the agent's runs and answers asks. The server checks
  what a device may send by the spec's rules; serving the calls comes in a later release, and until
  then it serves wake/v1 as before.

## 0.4.0 — 2026-10-12

### Added

- **`forScope` lists the runs in a scope, newest change first.** For an organisation's audit of its
  runs.

## 0.3.0 — 2026-10-11

### Added

- **SQLite and Cloudflare D1.** `@abyssinia-labs/wake-server/sqlite` has the tables for SQLite and a
  store over any async Drizzle SQLite driver, D1 and libSQL among them. Each change of state is one
  conditional update, as on Postgres, so two claims can't both win. On a Worker, a summons reaches
  an open stream on its next read, within `pollMs`.

## 0.2.0 — 2026-10-10

### Added

- **Run hooks: `started` and `finished`.** Pass `hooks` to hear when a run starts and ends, to update
  a status of your own as it goes.

## 0.1.0 — 2026-10-10

### Added

- **The first release: wake/v1 over HTTP, for any TypeScript app.** Fetch-API handlers
  (`wakeHandler`), storage behind a small interface, and Postgres through Drizzle. The thirty-minute
  notice is worked out on read, so no scheduler is needed, and the pending stream sends a change
  made in its process at once.
