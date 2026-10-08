# Wake

Wake starts your agent when someone hands it work. Mention your agent in a
Gatherd or Antescript comment, or assign it a ticket, and Wake, running on
your machine, starts it in the right repository to do the work: reply,
claim, write code and open a pull request.

Status: the client is written and tested on its own. Neither Gatherd nor
Antescript serves `wake/v1` yet, so there is nothing to pair with.

## How it works

- Wake keeps a Convex subscription open to each app you pair it with. An
  idle subscription costs nothing, and nothing polls.
- When the app has a summons for your agent, Wake claims it and starts
  `claude -p` in a fresh git worktree on the ticket's branch.
- The summons carries no text. The agent reads what it was asked over its
  own connection to the app.
- Your agent pairs Wake itself: it asks the app for a code and runs
  `wakectl pair gatherd.dev <code>`, so Wake serves exactly that agent.

## Using it

```bash
bun install
bun run wakectl help
```

1. In a Claude Code session on your Mac, ask your agent to pair Wake. It
   asks the app for a code and runs `wakectl pair gatherd.dev <code>`.
2. `wakectl install` starts the listener now and at every login, as a
   LaunchAgent (`dev.abyssinia.wake`), with the PATH of the shell you ran it
   from, so it finds `claude`, `git` and `gh`.
3. `wakectl status` shows what is paired, connected and running, with the
   `claude --resume` line for each run. `wakectl logs -f` follows the log.

`wakectl pause` stops new claims (a run already going finishes) and
`wakectl resume` goes on. `wakectl prune` removes run worktrees untouched
for 14 days, and keeps any with uncommitted work.

Place keys live in the macOS Keychain (`dev.abyssinia.wake`), never in the
config at `~/Library/Application Support/Wake/config.json`. Its settings:
`roots` (where to look for clones, `~/Projects` by default), `maxRuns` (2),
`runTimeoutMinutes` (120), and `extraAllowedTools` for a run.

## What a run does

For a ticket, Wake finds your clone of the repository the app names,
fetches, and makes a worktree on the ticket's branch under
`~/Library/Application Support/Wake/worktrees/`. It starts `claude -p`
there with edits accepted and a fixed tool list: git, `gh`, Bun and the
app's MCP server. It may reply, claim, commit, push its branch and open a
pull request, and never merges, force-pushes or pushes the default
branch. For a page, it runs in an empty folder with the app's tools only.

## The contract

Wake knows each app only through `wake/v1`: discovery at
`/.well-known/wake`, three HTTP routes (`pair`, `token`, `forget`) and
three Convex functions (`wake:pending`, `wake:claim`, `wake:finish`). The
full contract and the rules around it are the Wake pattern, kept word for
word in each app as `docs/product/wake-pattern.md`.

## Names

- Package: `@abyssinia-labs/wake` on npm
- Command: `wakectl` (`install`, `status`, `logs`, `pause`, `pair`, `forget`)
- Homebrew, later: `brew install abyssinia-labs/tap/wake`
