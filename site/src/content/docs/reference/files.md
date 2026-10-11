---
title: Files and settings
description: Where Wake keeps its config, state, log and keys.
---

| What | macOS | Linux |
| --- | --- | --- |
| Config | `~/Library/Application Support/Wake/config.json` | `~/.config/wake/config.json` |
| Listener state (`wake status` reads it) | `…/Wake/state.json` | `~/.config/wake/state.json` |
| Your runs, by name (`wake open`; the last 200) | `…/Wake/runs.json` | `~/.config/wake/runs.json` |
| Worktrees Wake made (`wake prune` removes only these) | `…/Wake/worktrees.json` | `~/.config/wake/worktrees.json` |
| Repositories each app has asked for | `…/Wake/asked-repos.json` | `~/.config/wake/asked-repos.json` |
| Log | `~/Library/Logs/Wake/wake.log` | `~/.local/state/wake/wake.log` |
| Place keys | The Keychain, service `dev.abyssinia.wake` | The Secret Service; without one, `~/.config/wake/keys.json` |
| The listener's service | `~/Library/LaunchAgents/dev.abyssinia.wake.plist` | `~/.config/systemd/user/wake.service` |
| Claude Code settings for herdr runs | `~/.wake/runs/<session>.settings.json` | the same |

On Linux, `$XDG_CONFIG_HOME` and `$XDG_STATE_HOME` move them, as usual.

The config, state, run history and log are readable by you alone (0600, in 0700
folders). Every setting has a command (see [Commands](/reference/commands/));
editing the file by hand works too, and the listener reads it within half a
minute. `bypassPermissions` in the file is read as the default.

Set `WAKE_HOME` to keep everything in another folder, for testing.

The service (a LaunchAgent, or a systemd user service) is written with the `PATH` of the shell you ran
`wake install` from, so it finds your agents, `git` and `gh`. Run it
again after you install a new agent somewhere else on your `PATH`.
