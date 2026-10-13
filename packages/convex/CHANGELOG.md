# Changelog

What changed in `@abyssinia-labs/wake-convex`, newest first, for an app
that serves wake/v1 from Convex. What changed in `wakectl` is in
[its own changelog](../../CHANGELOG.md).

## Unreleased

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
