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

When a run in herdr stops on a question (a tool asking permission, a
folder to trust), `wake status` shows it waiting for you, with the question
as its tab shows it, until the run goes on. The question stays on your
machine; an app that supports it hears only that the run waits. A run in
the background never waits: what isn't allowed is denied.

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
whichever tool made it.

## Follow-ups

When a ticket is summoned again after a run on it finished (a question in a
comment, say), Wake doesn't start another agent. It continues the session
that answered the last summons, in the same worktree and under the same
name, and the agent is told it is following up. In herdr it asks the agent
still open in the run's tab; with the tab closed, or headless, it resumes
the session:

| Tool | Resumes with |
| --- | --- |
| Claude Code | `claude -p --resume <session>` |
| Codex | `codex exec resume <session>` |
| Cursor | `cursor-agent -p --resume <session>` |

A follow-up needs the same app, ticket and tool. A new session starts only
when there is none to continue, or the last one finished more than 14 days
ago.

## Tidying worktrees

The listener removes the run worktrees it made once they are finished
with, two minutes after it starts and every six hours:

- a day after their branch is merged, squash merges included (it asks `gh`);
- a week after their last run, once everything in them is pushed.

It never removes one with uncommitted changes or with commits on no remote,
one a run is in, or one whose herdr tab is still open, and it never forces:
git itself refuses a worktree with changes. The branch goes with it where
that loses nothing. `wake prune` tidies now and says what it kept and why;
`--days` sets how long a pushed worktree waits.

## Which model

A run uses its tool's own default model, the one you get at the keyboard,
unless you pick one for it:

```bash
wake model claude opus --effort high
wake model codex gpt-6.1-sol --effort medium
wake model cursor composer-2.5
wake model                                # all three
wake model codex default --effort default # back to Codex's own
```

`wake setup` asks the same once for each tool you've paired:

| Tool | What setup offers | Effort |
| --- | --- | --- |
| Claude Code | `opus`, `sonnet`, `fable`, `haiku`: aliases that follow the newest model | `low` to `max` |
| Codex | The models Codex lists in `~/.codex` | The levels Codex lists for that model |
| Cursor | What `cursor-agent models` lists for your account | In the model's name, as `gpt-5.3-codex-high` |

Any tool also takes a name you type. The choice is yours, on your machine:
an app never picks the model a run uses.

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

Each entry is marked as Wake's, and the tidy removes it with the
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

in the run's worktree, which Wake keeps until it is tidied. The folder
stays on your machine; the app only ever learns the name. While a run is
going, `wake status` shows its resume line as well.

## Two at a time

A machine runs at most two at once; the rest wait, oldest first. Two runs
on the same branch take turns. `wake pause` stops new claims (a run
already going finishes) and `wake resume` goes on.
