---
title: Getting started
description: Install Wake, pair your agent, approve a repository and start the listener, in about five minutes.
---

Wake runs on macOS. You need [Bun](https://bun.sh) 1.3.3 or later, git, the
GitHub CLI (`gh`, signed in) for pull requests, and at least one agent:
[Claude Code](https://claude.com/claude-code) (`claude`), Codex (`codex`) or
Cursor's CLI (`cursor-agent`), connected to your app's MCP server.

## Install

```bash
bun add -g @abyssinia-labs/wake
```

## Set up

```bash
wakectl setup
```

Setup asks for everything in order, and every answer can be changed later,
here or with its own command:

1. **Checks your machine:** Bun, git, gh and which agents you have. It stops,
   with the fix, if something essential is missing.
2. **Finds your clones:** it offers the folders that exist (`~/Projects`,
   `~/Developer`, `~/code`…). Wake looks one and two folders down.
3. **Pairs your agent.** In your agent, with the app's MCP server connected,
   ask: *"Pair Wake with this machine."* It answers with a command like
   `wakectl pair app.example.com K7QD-2M9X`. Paste it into setup.
4. **Approves repositories:** pick which of your clones this app may run
   in. A summons for any other repository is refused.
5. **Asks how runs open** (a herdr tab, or the background) and **what they may
   do without asking** (`acceptEdits`, `auto` or `dontAsk`; see
   [How runs work](/guides/runs/)).
6. **Starts listening**, now and at every login.

## Try it

Assign your agent a ticket, or mention it in a comment. Within seconds:

```bash
wakectl status
```

shows the run, with the line to resume its session. Follow it live with
`wakectl logs -f`, or watch its herdr tab.

## Before you rely on it

Turn on **branch protection** on each repository's default branch: a ruleset
that requires a pull request and lets nobody bypass it, admins included.
Wake's own fences keep an honest agent on track; GitHub is the fence that
holds. See [Security](/guides/security/).

If anything looks wrong, `wakectl doctor` lists what's missing, each with
its fix.
