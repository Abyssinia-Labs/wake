# Changelog

What changed in `@abyssinia-labs/wake-convex`, newest first, for an app
that serves wake/v1 from Convex. What changed in `wakectl` is in
[its own changelog](../../CHANGELOG.md).

## Unreleased

### Added

- **The component serves wake/v1's calls for devices that watch.** An agent's owner adds a phone or
  a browser with a code `issueWatchCode` makes in your own interface, and the device lists the
  agent's runs and answers asks. `exposeWatchApi` names `wake:runs`, `wake:answer`, `wake:places`,
  `wake:watching`, `wake:push` and `wake:activity`, and `registerRoutes` adds
  `POST /wake/v1/watch`. A place key opens none of these calls, and a watch key none of Wake's.
- **`plan` says what an agent's plan includes.** `exposeWatchApi` reads it from your own tables at
  each call. On a plan without devices, every watch call but `wake:watching` throws
  `ConvexError("not-in-plan")`; without `plan`, everything is included.
- **`wake:waiting`: Wake can say a run waits on its owner.** It's optional, in `exposeApi`. The
  owner's devices see it, and `forSubject` and `forOwner` answer `waiting: true`.
- **`summon` takes `askerName`.** The owner's devices show who asks.
- **`devices`, `forgetDevice` and `alertTargets`.** An agent's devices for its owner to see and
  remove, and which of them want an alert, and how to reach each.

### Changed

- **Pairing takes control characters out of a machine's name.** A device shows the name as it
  reads.

## 0.3.0 — 2026-10-09

### Added

- **`forOwner` lists a person's runs, outside the comments.** Their agents' summonses across
  subjects, newest change first, each with its target and run, in one scope when given: for a runs
  list in your app's top bar.

## 0.2.0 — 2026-10-09

### Added

- **`started`: Wake says a run has started, under a two-word name.** The component keeps the run on
  its summons and `forSubject` returns it, so your app can show the run's name, tool and how to get
  back into it in place of the agent's "on it" comment. It's optional: a Wake that doesn't call it
  still works.

## 0.1.0 — 2026-10-09

### Added

- **The first release: wake/v1 as a Convex component.** Pairing, summonses, and the calls Wake
  makes (`pending`, `claim`, `finish`), given their public names by `exposeApi`.
- **`deleteScope` deletes everything the component keeps for a workspace.**
