---
title: Files and settings
description: Where Wake keeps its config, state, log and keys.
---

| What | Where |
| --- | --- |
| Config | `~/Library/Application Support/Wake/config.json` |
| Listener state (`wakectl status` reads it) | `~/Library/Application Support/Wake/state.json` |
| Log | `~/Library/Logs/Wake/wake.log` |
| Place keys | The macOS Keychain, service `dev.abyssinia.wake` |
| LaunchAgent | `~/Library/LaunchAgents/dev.abyssinia.wake.plist` |
| Claude Code settings for herdr runs | `~/.wake/runs/<session>.settings.json` |

The config, state and log are readable by you alone (0600, in 0700
folders). Every setting has a command (see [Commands](/reference/commands/));
editing the file by hand works too, and the listener reads it within half a
minute. `bypassPermissions` in the file is read as the default.

Set `WAKE_HOME` to keep everything in another folder, for testing.

The LaunchAgent is written with the `PATH` of the shell you ran
`wakectl install` from, so it finds your agents, `git` and `gh`. Run it
again after you install a new agent somewhere else on your `PATH`.
