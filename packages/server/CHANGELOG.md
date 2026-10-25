# Changelog

What changed in `@abyssinia-labs/wake-server`, newest first, for an app
that serves wake/v1 over HTTP. What changed in `wakectl` is in
[its own changelog](../../CHANGELOG.md).

## Unreleased

## 0.5.0 — 2026-10-24

### Added

- **The server serves wake/v1's calls for devices that watch.** An agent's owner adds a phone or a
  browser with a code `issueWatchCode` makes in your own interface, and the device lists the
  agent's runs and answers asks. `wakeHandler` serves `POST /wake/v1/watch` and the watch routes
  (`runs`, as server-sent events like `pending`, `answer`, `places`, `watching`, `push`,
  `activity`), with CORS for a browser. A place key opens none of them, and a watch key none of
  Wake's.
- **`plan` says what an agent's plan includes.** It is asked at each watch call. On a plan without
  devices, every watch route but `watching` answers `402 not-in-plan`; without `plan`, everything
  is included.
- **`POST /wake/v1/waiting`: Wake can say a run waits on its owner.** The owner's devices see it,
  and `forSubject`, `forOwner` and `forScope` answer `waiting: true`.
- **`summon` takes `askerName`.** The owner's devices show who asks.
- **`devices`, `forgetDevice` and `alertTargets`.** An agent's devices for its owner to see and
  remove, and which of them want an alert, and how to reach each.

### Changed

- **New tables and columns: migrate before you deploy.** `wake_watch_codes` and
  `wake_devices` are new, and `wake_places.last_claim_at`, `wake_summonses.asker_name` and
  `wake_summonses.waiting` are added. drizzle-kit finds them, `WAKE_TABLES_SQL` run again adds
  them, and on SQLite `WAKE_SQLITE_DEVICES_UPGRADE` does, once.
- **A `WakeStore` of your own needs the device methods.** `insertWatchCode`, `useWatchCode`,
  `insertDevice`, `deviceByKeyHash`, `devicesOf`, `patchDevice` and `latestOf`.
- **Pairing takes control characters out of a machine's name.** A device shows the name as it
  reads.

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
