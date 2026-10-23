# Changelog

What changed in `@abyssinia-labs/wake-convex`, newest first, for an app
that serves wake/v1 from Convex. What changed in `wakectl` is in
[its own changelog](../../CHANGELOG.md).

## Unreleased

### Added

- **wake/v1 has calls for devices that watch, which this component doesn't serve yet.** The spec
  adds a watch key, which an agent's owner trades for a code your app shows them, and the calls it
  opens, for a phone or a browser that lists the agent's runs and answers asks. The component
  checks what a device may send by the spec's rules; serving the calls comes in a later release,
  and until then it serves wake/v1 as before.

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
