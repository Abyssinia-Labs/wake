# Changelog

What changed in `wakectl`, newest first, for a person using it. Wake for
GitHub has no versions of its own, so its changes are listed with the
release they shipped beside, marked so. Apps that serve wake/v1 have their
own: [the Convex component](packages/convex/CHANGELOG.md) and
[the HTTP server](packages/server/CHANGELOG.md).

## Unreleased

### Added

- **Pick the model each of your agents runs with.** `wakectl model claude opus --effort high`,
  or answer the new question in `wakectl setup`, which offers Claude Code's aliases, the models
  Codex lists, and the ones `cursor-agent models` lists for your account. With nothing picked, a
  run uses its tool's own default, as before. `wakectl status` shows the choice.
- **`wakectl update` says what changed since your version.** The headline of each release in
  between, security fixes marked, and a link to the rest. You'll see it from your next update after
  this one, since the version being replaced is the one that runs it.
- **Wake for GitHub: plans, with organisation policy and an audit on Team.** The basic loop stays
  free. On Team, an organisation's admins choose which repositories may summon an agent and who
  may, and see the organisation's runs, at `github.wakectl.dev/org/<login>`.

### Fixed

- **A run's signature names its real tool and model.** The example it was given said Claude Code
  (Opus), and Codex, Cursor and Sonnet runs copied it.

### Security

- **Wake for GitHub: uninstalling the app deletes which issue each summons was about, and who
  asked.** It deleted the summonses but kept that record.

## 0.3.1 — 2026-10-12

### Added

- **`wakectl read <comment url>` reads a GitHub comment, read-only.** An inline review comment, an
  issue comment or a review: who wrote it, the file and line it's on, and the text, in one fixed
  request. A run woken from an inline review comment can now read what it says, where `gh api` is
  denied.
- **Wake for GitHub is hosted at github.wakectl.dev, and listed on wakectl.dev.**

## 0.3.0 — 2026-10-11

### Added

- **Wake runs on Linux.** The listener is a systemd user service, Wake's files are in the XDG
  folders, and place keys are in the Secret Service, or in a file only you can read on a machine
  with none (a server, a container). `wakectl doctor` checks bubblewrap and socat for Claude Code's
  sandbox, the user session, and lingering.

## 0.2.2 — 2026-10-11

### Changed

- **A run signs what it posts under your name.** A comment an agent posts with your gh sign-in ends
  with a line naming its tool, model and run, so nobody takes it for yours.

### Fixed

- **`wakectl status` fits a longer app domain.**

## 0.2.1 — 2026-10-11

### Added

- **Wake for GitHub: the label `wake`, or `/wake` in a comment, starts your agent.** On an issue, a
  comment or a review, for someone who can push to the repository and has paired. The issue gets
  a reaction and one status comment, edited as the run goes.
- **A run can answer an issue with `gh issue comment`.**

### Fixed

- **A run keeps gh, git push and git fetch on lines of their own.** Chained with other commands
  they ran inside the sandbox, where gh can't read your sign-in, and the run stopped.

## 0.2.0 — 2026-10-10

### Added

- **Apps can serve wake/v1 over plain HTTP.** An app on Postgres behind a web server no longer
  needs Convex. Wake picks the transport when it pairs, reads the app's stream of summonses,
  reconnects with backoff, and asks every thirty seconds when the stream keeps failing.
  `wakectl check` tests HTTP apps too.

## 0.1.7 — 2026-10-09

### Added

- **Every run has a two-word name, and the app can show it.** Like `amber-heron`: the same in the
  app, `wakectl status`, the log and herdr's tab. Wake tells an app that supports it that the run
  has started, with its tool and session, so the agent doesn't comment just to say it's on it.
- **`wakectl open <name>` gets you back into a run.** It starts the run's tool on its session, in
  its folder. `wakectl open` alone lists recent runs.

## 0.1.6 — 2026-10-09

### Added

- **`wakectl update` installs the newest Wake and restarts the listener onto it.**
- **`wake` is a shorter name for `wakectl`.**

## 0.1.5 — 2026-10-09

### Fixed

- **A prompt that never reached the agent in herdr is sent again.** After you answer a question an
  agent asks before it starts, Wake waits a moment before the prompt, and resends a stalled one at
  most twice.

## 0.1.4 — 2026-10-09

### Fixed

- **Runs in herdr start again.** Since 0.1.1, every run in herdr failed while opening its tab.

## 0.1.3 — 2026-10-09

### Security

- **Setup lists first the repositories an app has asked for, and confirms a large approval.**
  Approving more than ten at once asks first, and the default is no: approve only what the app
  should work in.

## 0.1.2 — 2026-10-09

### Added

- **`wakectl check <domain>` tests an app against the wake/v1 spec.** It pairs nothing and changes
  nothing.
- **wakectl.dev: getting started, guides, the command reference and the spec.**

## 0.1.1 — 2026-10-09

### Added

- **The first release.** Pair Wake with an app, and when the app summons your agent, Wake starts
  Claude Code, Codex or Cursor in a worktree on the ticket's branch.
- **`wakectl setup` asks for everything a first run needs, in order.** `wakectl doctor` lists what
  the machine lacks, with the fix.
- **Runs can open in herdr, to watch and step in.** `wakectl mode herdr`.
- **You choose what a run may do without asking.** `wakectl permissions acceptEdits|auto|dontAsk`;
  `bypassPermissions` is never offered.

### Security

- **Runs are fenced.** Sandboxed, only in repositories you've approved, and never with the branch's
  own agent settings.
