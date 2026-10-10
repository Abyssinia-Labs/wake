---
title: Files and settings
description: Where Wake keeps its config, state, log and keys.
---

| What | Where |
| --- | --- |
| Config | `~/Library/Application Support/Wake/config.json` |
| Listener state (`wake status` reads it) | `~/Library/Application Support/Wake/state.json` |
| Your runs, by name (`wake open` reads it; the last 200) | `~/Library/Application Support/Wake/runs.json` |
| Worktrees Wake made (`wake prune` removes only these) | `~/Library/Application Support/Wake/worktrees.json` |
| Repositories each app has asked for (setup offers them first) | `~/Library/Application Support/Wake/asked-repos.json` |
| Log | `~/Library/Logs/Wake/wake.log` |
| Place keys | The macOS Keychain, service `dev.abyssinia.wake` |
| LaunchAgent | `~/Library/LaunchAgents/dev.abyssinia.wake.plist` |
| Claude Code settings for herdr runs | `~/.wake/runs/<session>.settings.json` |

The config, state, run history and log are readable by you alone (0600, in 0700
folders). Every setting has a command (see [Commands](/reference/commands/));
editing the file by hand works too, and the listener reads it within half a
minute. `bypassPermissions` in the file is read as the default.

Set `WAKE_HOME` to keep everything in another folder, for testing.

The LaunchAgent is written with the `PATH` of the shell you ran
`wake install` from, so it finds your agents, `git` and `gh`. Run it
again after you install a new agent somewhere else on your `PATH`.
