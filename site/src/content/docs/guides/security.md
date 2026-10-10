---
title: Security
description: What a run can and can't reach, what Wake refuses, and the one setting that matters most.
---

Wake starts an agent with a shell on your machine because someone wrote in
an app. Text in a ticket can try to talk the agent into things. Wake is
built so that what it can reach is small, and so that the one fence that
holds is GitHub's.

## Turn on branch protection

For each repository Wake runs in, add a ruleset on the default branch that
**requires a pull request** and lets **nobody bypass it, admins
included**. On GitHub: *Settings → Rules → Rulesets → New branch ruleset*,
target the default branch, check *Require a pull request before merging*,
and leave the bypass list empty.

An agent with a shell can get around a deny list; it can't get around
that.

## What a run can reach

**Claude Code** runs with Wake's settings only: your repository's
`.claude` settings and hooks are not loaded, and the agent reads your
CLAUDE.md itself. Its shell runs in Claude Code's sandbox:

- it writes only in the worktree;
- it connects only to GitHub and the npm registry;
- it can't read `~/.ssh`, `~/.config/gh`, `~/.aws` or your other tools'
  credentials;
- pushing the run's own branch, `git fetch` and gh's pull request commands
  run outside the sandbox, by name; `gh api`, `gh auth`, `git -c`,
  `git config` and `bunx` are denied.

**Cursor** runs with `--sandbox enabled`: a command runs sandboxed with no
network, except the same short list that runs outside it. Cursor's sandbox
doesn't hide your credentials from a shell command.

**Codex** runs in its `workspace-write` sandbox, which reads anywhere and
has network on.

For a repository where that difference matters, pair Claude Code.

## What Wake refuses

- A repository you haven't approved for that app (`wake repos`).
- The default branch, and any branch checked out in a folder Wake didn't
  make (your own worktree, say).
- Anything from an app that isn't the shape [wake/v1](/spec/wake-v1/)
  allows: discovery URLs that aren't https, an app name that isn't a plain
  name, unbounded ids, labels or prompts.
- A repository's own `.cursor/cli.json`, or a `.cursor` that is a link.
  Wake writes Cursor's limits fresh at every run.
- Your clone's git hooks, when it makes a worktree, and your repository's
  install scripts, when it installs dependencies.
- MCP servers a branch lists for Cursor.

## What stays on your machine

Place keys live in the macOS Keychain, never in a file. Wake's config,
state and log are readable by you alone. When a run fails, the ticket says
why only in words written to be shared; paths and command output stay in
`wake logs`.

## Reporting a vulnerability

Use **Report a vulnerability** on the
[repository's Security tab](https://github.com/Abyssinia-Labs/wake/security).
Please don't open a public issue.
