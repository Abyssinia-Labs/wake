---
title: Commands
description: Every wakectl command.
---

## Get started

| Command | Does |
| --- | --- |
| `wakectl setup` | Everything a first run needs, asked in order. Run again any time. |
| `wakectl doctor` | What this machine has and lacks, each with its fix. |
| `wakectl pair <domain> <code> [--tool claude\|codex\|cursor]` | Pair with an app. Your agent gives you this command. `--tool` when the app couldn't tell which tool asked. |
| `wakectl repos [allow\|remove <owner/name>] [--app <domain>]` | Which repositories each app may run in on this machine. `--app` when more than one app is paired. |
| `wakectl install` | Start listening now and at every login (a LaunchAgent). |
| `wakectl status` | What is paired, connected and running, with each run's resume line. |

## Watch

| Command | Does |
| --- | --- |
| `wakectl logs [-f]` | The listener's log; `-f` follows it. |

## How runs work

| Command | Does |
| --- | --- |
| `wakectl mode [headless\|herdr]` | In the background, or a tab in herdr you can watch. |
| `wakectl permissions [acceptEdits\|auto\|dontAsk]` | What a run may do without asking. |
| `wakectl allow [rule] [--remove]` | A tool runs may use beyond Wake's own, e.g. `"Bash(make test:*)"`. |
| `wakectl trust codex [on\|off]` | Let Codex runs in herdr skip "trust this folder?". |

## Housekeeping

| Command | Does |
| --- | --- |
| `wakectl pause` / `wakectl resume` | Stop, or go on, claiming new work. A run already going finishes. |
| `wakectl prune [--days 14]` | Remove run worktrees untouched that long; never one with uncommitted work. |
| `wakectl forget <domain>` | Unpair an app's agents, here and on the app. |
| `wakectl update` | Install the newest Wake from npm, and restart the listener onto it. |
| `wakectl uninstall` | Stop, and don't start at login. |
| `wakectl check <domain>` | Test an app against the [wake/v1 spec](/spec/wake-v1/). Pairs nothing, changes nothing. |

`wake` is the same command, shorter to type: `wake status`, `wake logs -f`.
`wakectl help` prints this list; `wakectl --version` the version. Colour is
off when `NO_COLOR` is set or the output isn't a terminal.
