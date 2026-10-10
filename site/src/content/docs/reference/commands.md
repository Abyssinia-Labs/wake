---
title: Commands
description: Every wake command (wakectl is the same command, longer).
---

## Get started

| Command | Does |
| --- | --- |
| `wake setup` | Everything a first run needs, asked in order. Run again any time. |
| `wake doctor` | What this machine has and lacks, each with its fix. |
| `wake pair <domain> <code> [--tool claude\|codex\|cursor]` | Pair with an app. Your agent gives you this command. `--tool` when the app couldn't tell which tool asked. |
| `wake repos [allow\|remove <owner/name>] [--app <domain>]` | Which repositories each app may run in on this machine. `--app` when more than one app is paired. |
| `wake install` | Start listening now and at every login (a LaunchAgent). |
| `wake status` | What is paired, connected and running: each run by its name, with its resume line. |

## Watch

| Command | Does |
| --- | --- |
| `wake logs [-f]` | The listener's log; `-f` follows it. |
| `wake open [name]` | Back into a run by the name the app shows (`amber-heron`): its tool, on its session, in its folder. With no name, the recent runs. |

## How runs work

| Command | Does |
| --- | --- |
| `wake mode [headless\|herdr]` | In the background, or a tab in herdr you can watch. |
| `wake permissions [acceptEdits\|auto\|dontAsk]` | What a run may do without asking. |
| `wake allow [rule] [--remove]` | A tool runs may use beyond Wake's own, e.g. `"Bash(make test:*)"`. |
| `wake trust codex [on\|off]` | Let Codex runs in herdr skip "trust this folder?". |

## Housekeeping

| Command | Does |
| --- | --- |
| `wake pause` / `wake resume` | Stop, or go on, claiming new work. A run already going finishes. |
| `wake prune [--days 14]` | Remove run worktrees untouched that long; never one with uncommitted work. |
| `wake forget <domain>` | Unpair an app's agents, here and on the app. |
| `wake update` | Install the newest Wake from npm, and restart the listener onto it. |
| `wake uninstall` | Stop, and don't start at login. |
| `wake check <domain>` | Test an app against the [wake/v1 spec](/spec/wake-v1/). Pairs nothing, changes nothing. |

`wake` and `wakectl` are the same command: the agent's pairing answer says
`wakectl pair …`, and `wake pair …` does the same. `wake help` prints this list; `wake --version` the version. Colour is
off when `NO_COLOR` is set or the output isn't a terminal.
