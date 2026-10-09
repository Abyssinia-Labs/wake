---
title: How runs work
description: Where a run happens, which tool runs it, what it may do without asking, and how to resume it.
---

## Background or herdr

```bash
wakectl mode headless   # the default: runs in the background
wakectl mode herdr      # each run opens as a tab in herdr's "Wake" workspace
```

In [herdr](https://herdr.dev) you can watch a run, answer its questions and
type into it. If herdr isn't running, a run goes to the background.

## Which tool, and where

A pairing names the tool that runs its agent: Claude Code, Codex or Cursor.
Pair from that tool and the app tells Wake which it was; if it can't tell
(the Codex CLI often reaches an app as "ChatGPT"), pair with
`wakectl pair … --tool codex`.

Each run gets a git worktree on the ticket's branch, where its tool keeps
its own:

| Tool | Worktrees |
| --- | --- |
| Claude Code | `<clone>/.claude/worktrees/<branch>` |
| Cursor | `~/.cursor/worktrees/<repo>/<branch>` |
| Codex | `~/.codex/worktrees/wake/<repo>/<branch>` |

A branch an earlier run already has checked out carries on in that folder,
whichever tool made it. Worktrees are kept so you can resume a session;
`wakectl prune` removes the ones untouched for 14 days, never one with
uncommitted work.

## What a run may do without asking

```bash
wakectl permissions acceptEdits   # the default
wakectl permissions auto
wakectl permissions dontAsk
```

| Mode | What it means |
| --- | --- |
| `acceptEdits` | Edits and the allowed tools go ahead; anything else asks. In the background an ask is denied; in herdr it waits for you. |
| `auto` | Claude Code's auto mode, or Cursor's Auto-review, decides what's safe and asks about the rest. |
| `dontAsk` | Anything not allowed is denied, so a run never waits. Claude Code only; Cursor keeps to its list and asks. |

`bypassPermissions` is never offered. Commands that run inside the
[sandbox](/guides/security/) go ahead without asking in every mode.

To let runs use a tool beyond Wake's own list:

```bash
wakectl allow "Bash(make test:*)"
wakectl allow "Bash(make test:*)" --remove
```

## Codex in herdr

Interactive Codex asks whether to trust each new folder, and every
worktree is new. Either answer it in the tab, or let Wake add each run's
worktree to `~/.codex/config.toml` first:

```bash
wakectl trust codex on
```

Each entry is marked as Wake's, and `wakectl prune` removes it with the
worktree.

## Resume a run

`wakectl status` shows each run with its resume line. From the worktree:

```bash
claude --resume <session>
codex resume <session>
cursor-agent --resume <session>
```

## Two at a time

A machine runs at most two at once; the rest wait, oldest first. Two runs
on the same branch take turns. `wakectl pause` stops new claims (a run
already going finishes) and `wakectl resume` goes on.
