---
title: Troubleshooting
description: The usual reasons a run doesn't start, and how to see why.
---

Start with these two:

```bash
wakectl doctor     # what's missing, each with its fix
wakectl logs -f    # what the listener is doing right now
```

## Nothing happens when I assign my agent

- **Not listening.** `wakectl status` should show the app as *listening*.
  If it isn't installed, `wakectl install`.
- **Paused.** `wakectl resume`.
- **The tool isn't installed** on this machine: status says so. Wake
  doesn't claim work it can't run, so another machine can.
- **Someone else asked.** A summons a teammate makes waits for your yes in
  the app.

## "This machine hasn't approved … for …"

The ticket's repository isn't approved for that app here. The message has
the command; it looks like:

```bash
wakectl repos allow your-org/your-repo --app app.example.com
```

## "No clone of … in the folders Wake looks in"

Clone the repository under one of your clone folders (`wakectl status`
lists them), or add its folder with `wakectl setup`.

## A herdr tab opens but nothing starts

Look at the tab. The agent may be asking something before it starts (Codex
asks to trust each new folder: answer it, or `wakectl trust codex on`), or
it may have exited with an error herdr didn't pass on.

## Cursor can't reach the app

Cursor keeps its MCP sign-ins per folder, so a new worktree can start
signed out of the app. In a herdr tab, run `/mcp login <app>` there; in the
background, the run can't sign in and fails. This is Cursor's behaviour;
Claude Code and Codex sign in once.

## The ticket says it couldn't finish

The reason on the ticket is the shareable part. The detail (paths,
command output) is in `wakectl logs`.
