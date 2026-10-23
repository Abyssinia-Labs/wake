# Changelog

What changed in `wakectl`, newest first, for a person using it. Wake for
GitHub has no versions of its own, so its changes are listed with the
release they shipped beside, marked so. Apps that serve wake/v1 have their
own: [the Convex component](packages/convex/CHANGELOG.md) and
[the HTTP server](packages/server/CHANGELOG.md).

## Unreleased

### Added

- **`wakectl limits` sets runs at once and when a run is stopped.** `wakectl limits runs 1` lets
  one run go at a time (two at most, as before), and `wakectl limits stop-after 90` stops a run
  after 90 minutes rather than 120. Both take within half a minute, with no restart.
- **`wakectl roots` sets where Wake looks for your clones.** `wakectl roots add ~/code` and
  `wakectl roots remove ~/code` change the folders setup asks about, one and two folders down;
  `wakectl roots` lists them.
- **`wakectl setup --json` for an app that runs setup its own way.** It prints what setup would
  ask, with today's answers: this machine's checks, the folders it offers, the clones there and
  which apps asked for each, run modes, models and whether the listener starts at login. It
  changes nothing, and no key is ever in it.
- **Each run keeps the link to what it was summoned for.** `wakectl status --json` and
  `wakectl open --json` give each run's `url`, the page on the app it works on, and `herdr`,
  whether it runs in a herdr tab or headless, so a program can link to the ask and offer the
  right way back in. Runs kept by an older Wake have neither.
- **`wakectl status` shows a run in herdr waiting on you.** When a run stops on a question in its
  tab, a tool asking permission or a folder to trust, `status` says so with the question as the
  tab shows it, `status --json` gives the run's `waiting` (`since` and `what`), and the log says
  it. It clears when the run goes on. The question stays on your machine: an app that supports
  `wake:waiting` hears only that the run waits, and when it goes on.

- **wakectl as a single file, no Bun needed.** Each release on GitHub now carries a binary for
  macOS (Apple silicon and Intel) and Linux (x64 and arm64), each with its SHA-256. `wakectl
  install` starts the listener from it, and `wakectl update` tells you when a newer one is out
  rather than reaching for npm.
- **Stop a run now: `wakectl stop amber-heron`.** It ends a run going on this machine, found by
  its name, its ticket or its session id. A headless run's tool is stopped; a run in herdr is
  interrupted with Esc and its tab kept. The app shows the run couldn't finish, stopped by its
  owner.
- **Each run's steps are kept on your machine, a file per run.** The lines `wakectl logs` shows
  for a run also go to its own file under `runs/` in Wake's folder, as JSON lines, so a program
  can show one run's steps without reading the whole log. Readable by you alone, never sent
  anywhere, and removed when Wake forgets the run after its last 200.
- **`--json` for scripts and apps that drive wakectl.** `wakectl status --json` prints the
  listener, each pairing's connection, the runs with their resume commands, the approved
  repositories and the settings as JSON; `repos`, `model`, `doctor` and `open` take it too. Only
  the forms that change nothing do, and no key is ever in it.
- **wake/v1 has calls for devices that watch.** An app can let an agent's owner add a phone, a
  browser or a desktop app that lists the agent's runs and answers asks. Each holds a watch key,
  made only from a code the app shows its signed-in owner, so nothing a run can reach can say yes
  for them. An optional `wake:waiting` lets Wake say a run waits on its owner. The spec has them
  now, `wakectl check` probes them, and Wake calls `wake:waiting` when a run in herdr waits.
- **`wakectl check` tests an app's calls for devices that watch.** Where the app makes watch
  codes, it checks that `POST /wake/v1/watch` and every watch call refuse what they must: a code
  nobody issued, a key that opens nothing, and this machine's own place key when it is paired with
  the app, since a place key must open none of them. It tries the optional `waiting` too.
- **Wake for GitHub: Pro, a plan for your own account.** $8 a month or $80 a year, for what Wake's
  paid apps need: your runs, and what they ask you, on your other devices. Until those apps come,
  it does what Free does. Team stays the organisation's plan, with its policy and audit; like
  Team, Pro isn't on sale yet.

### Changed

- **`wakectl open` never starts a run that is still going a second time.** For a run going in
  herdr, it brings the run's tab to the front and opens herdr in your terminal (from inside
  herdr, the tab alone). For one going headless, it says so and that `wakectl stop` ends it,
  where it used to resume the session beside the run and fight it. A run that has ended resumes
  in your terminal as before.
- **`wakectl install` leaves an app's listener alone.** When an app on your Mac runs the listener
  itself, as its own login item, `install` writes no second LaunchAgent under the same name and
  `uninstall` doesn't stop it: each says an app runs it, and that start at login is that app's
  setting. `doctor` and `setup` count it as installed, and `pair` no longer says to install.

## 0.4.1 — 2026-10-14

### Fixed

- **A Cursor run that isn't signed in to the app no longer starts blind.** Cursor keeps MCP
  sign-ins per folder, so a run on a new branch started signed out and couldn't read what it was
  asked. Wake now checks first: the ticket says why the run didn't start, `wakectl logs` gives
  the one command that signs that folder in, and `wakectl doctor` checks that Cursor has the
  app's MCP server.

## 0.4.0 — 2026-10-13

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
