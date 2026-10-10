---
title: How runs work
description: Where a run happens, which tool runs it, what it may do without asking, its name, and how to get back into it.
---

## Background or herdr

```bash
wake mode headless   # the default: runs in the background
wake mode herdr      # each run opens as a tab in herdr's "Wake" workspace
```

In [herdr](https://herdr.dev) you can watch a run, answer its questions and
type into it. If herdr isn't running, a run goes to the background.

## Which tool, and where

A pairing names the tool that runs its agent: Claude Code, Codex or Cursor.
Pair from that tool and the app tells Wake which it was; if it can't tell
(the Codex CLI often reaches an app as "ChatGPT"), pair with
`wake pair … --tool codex`.

Each run gets a git worktree on the ticket's branch, where its tool keeps
its own:

| Tool | Worktrees |
| --- | --- |
| Claude Code | `<clone>/.claude/worktrees/<branch>` |
| Cursor | `~/.cursor/worktrees/<repo>/<branch>` |
| Codex | `~/.codex/worktrees/wake/<repo>/<branch>` |

A branch an earlier run already has checked out carries on in that folder,
whichever tool made it. Worktrees are kept so you can resume a session;
`wake prune` removes the ones untouched for 14 days, never one with
uncommitted work.

## What a run may do without asking

```bash
wake permissions acceptEdits   # the default
wake permissions auto
wake permissions dontAsk
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
wake allow "Bash(make test:*)"
wake allow "Bash(make test:*)" --remove
```

## Codex in herdr

Interactive Codex asks whether to trust each new folder, and every
worktree is new. Either answer it in the tab, or let Wake add each run's
worktree to `~/.codex/config.toml` first:

```bash
wake trust codex on
```

Each entry is marked as Wake's, and `wake prune` removes it with the
worktree.

## Every run has a name

Each run gets two words, like `amber-heron`: the same on the app, in the
herdr tab, in `wake status` and in the log. When the app supports it, Wake
reports the start (the run's name, its tool and its session), so the app
shows "Claude is on it as amber-heron" where you asked, and the agent is
told not to comment just to say it started. The machine and the session
are shown to the agent's owner only; everyone else sees the name.

## Get back into a run

```bash
wake open                # your recent runs: name, ticket, app, how it ended
wake open amber-heron    # its tool, on its session, in its folder, here
```

`wake open` takes a session id too. It starts the run's own tool:

```bash
claude --resume <session>
codex resume <session>
cursor-agent --resume <session>
```

in the run's worktree, which Wake keeps until `wake prune`. The folder
stays on your machine; the app only ever learns the name. While a run is
going, `wake status` shows its resume line as well.

## Two at a time

A machine runs at most two at once; the rest wait, oldest first. Two runs
on the same branch take turns. `wake pause` stops new claims (a run
already going finishes) and `wake resume` goes on.
