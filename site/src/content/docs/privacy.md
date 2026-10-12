---
title: Privacy
description: What Wake and Wake for GitHub keep, where it lives, who else touches it, and how to have it deleted.
---

<!--
Every claim here follows the code: the command's files in src/config.ts and
src/history.ts, its keys in src/secrets.ts, what it sends in src/place.ts,
src/http-place.ts and src/run.ts; the bridge's tables in
packages/server/src/{drizzle,sqlite}/schema.ts and apps/github/src/{db,kv}.ts,
its sign-in in apps/github/src/oauth.ts and session.ts, what it writes to
GitHub in apps/github/src/{webhook,hooks}.ts, its permissions in
apps/github/github-app.json. Keep it in step when any of those change; a
privacy page that has drifted is worse than none.
-->

_Effective 12 October 2026._

Wake starts your coding agent on your own machine when someone hands it
work. It is made by Abyssinia Labs LLC and comes in three parts: **the
`wake` command**, which runs on your machine; **Wake for GitHub**, a service
at `github.wakectl.dev`; and **this site**. This page says what each keeps
about you, where that lives, who else touches it, and how to have it
deleted.

## The `wake` command

**It keeps everything on your machine.** Its config (the apps you paired,
their agents' names, the repositories you approved for each, your
settings), the listener's state, the list of worktrees it made, the
repositories apps have asked for, its log, and a history of your last 200
runs (each run's name, what it was about, the app, the tool, its session
and its folder) live in Wake's folder: `~/Library/Application Support/Wake`
and `~/Library/Logs/Wake` on macOS, `~/.config/wake` and
`~/.local/state/wake` on Linux. They are readable by you alone. The keys
that pair it with apps live in the macOS Keychain or Linux's Secret
Service; a Linux machine with none keeps them in a file only you can read.

**It sends nothing to Abyssinia Labs.** No telemetry, no analytics, no
crash reports. It talks to:

- **The apps you pair.** Pairing tells the app your machine's name and
  platform (`darwin`, `linux`). While it listens, it asks the app what
  your agent has been asked; when it starts a run it tells the app the
  run's name, the tool and the tool's session id, so the app can show it
  to you; when a run ends it says whether it finished, and why not in
  words written to be shared, never paths or command output.
- **The npm registry**, when you run `wake update`, to learn the newest
  version.
- **GitHub, through your own `gh` and `git`**, for what a run does there.

**The agents it starts are yours.** Claude Code, Codex and Cursor run on
your machine under their makers' terms; what they send, and where, is
governed there. Wake keeps them in a sandbox and never bypasses their
permission checks; see [Security](/guides/security/).

## Wake for GitHub

**Signing in.** You sign in with GitHub. We keep your GitHub user id and
login, in a cookie signed by the service that lasts 30 days. The token
GitHub gives at sign-in is used once, to learn who you are, and dropped.
We never see your password or your email address.

**Pairing.** For each tool you pair (Claude Code, Codex, Cursor): your
machine's name and platform, when it paired and when it was last heard
from, and a hash of the key it holds. A pairing code is kept as a hash for
ten minutes, and works once.

**When you ask.** A `wake` label or a `/wake` comment makes a record of
what was asked: your GitHub id and login, the repository, the issue or
pull request's number and address, a branch name made from the first
words of its title, and the instructions your agent is given, which name
the issue and the `gh` commands to read it, never its text. The text of
issues and comments arrives in GitHub's notifications to the service; it
is read there to find `/wake`, and not kept. Once your agent starts, the
record also holds the run's name, the tool, its session id and your
machine's name. How it ended, and why not, is kept with it.

**Organisations.** For each account the app is installed on: its id,
login, type and installation. On Team, its plan as GitHub Marketplace
reports it (the plan, the number of seats, a trial's end) or as we granted
it, and its Wake policy (which repositories may summon, who may, and who
last set it). Payment is GitHub's: we never see a card.

**What it does on GitHub.** It reacts to the issue or comment that asked
(👀), and writes one comment per run, edited as the run goes, with the
run's name and who asked; never your machine's name or the session. It
reads organisation membership to tell admins from members, for the
organisation page. It has no access to your code: its permissions are
Issues and Pull requests (read and write, for the reactions and that
comment), Metadata and Members (read).

## This site

wakectl.dev is static pages on Cloudflare. Its fonts come from Google
Fonts, so your browser asks Google for them, which tells Google your IP
address. Your browser remembers whether you chose light or dark. No
cookies, no analytics, no tracking pixels.

## Where it lives

Wake for GitHub runs on Cloudflare: the service on Cloudflare Workers, its
records in Cloudflare D1 in North America. Cloudflare keeps the service's
request logs for up to seven days. Sign-in and the app itself are
GitHub's. The `wake` command's files, keys and log stay on your machine.

Nothing Wake keeps is sold, shared for advertising, sent to an AI service
by us, or used to train anything.

## Who can see it

You. On Team, your organisation's admins see its runs on its organisation
page: when, the issue, who asked, the run's name and how it ended, not
your machine or the session. Anyone who can read the issue sees the
reaction and the status comment. We look at the service's records only to
run it, or when you ask for help.

## Keeping and deleting

- **Uninstalling the GitHub App** from an account deletes what was asked
  through it: the record of each summons and run, and which issue it was
  about.
- **`wake forget github.wakectl.dev`** on your machine ends that pairing:
  the key stops working, and the machine leaves your list. Its record is
  kept, marked forgotten.
- **A pairing code** is useless ten minutes after it is made, or once used;
  its hash is kept.
- **Taking the `wake` label off**, or closing the issue, lets a waiting
  summons go.
- Everything else (your sign-in's id and login on your records, your
  paired machines' records, an organisation's plan and policy) is kept
  until you ask us to delete it. Write to the address
  below from the GitHub account it is about, and we will delete it within
  30 days.

The `wake` command's own files are yours to delete: `wake uninstall`, then
remove its folder.

## Contact

Abyssinia Labs LLC, [support@wakectl.dev](mailto:support@wakectl.dev)
