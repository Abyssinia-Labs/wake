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
2. `wakectl repos allow abyssinia-labs/gatherd` lets the app run in that
   repository on this machine. A summons for a repository you haven't
   approved is refused, and the ticket says the command to approve it.
3. `wakectl install` starts the listener now and at every login, as a
   LaunchAgent (`dev.abyssinia.wake`), with the PATH of the shell you ran it
   from, so it finds `claude`, `git` and `gh`.
4. `wakectl status` shows what is paired, connected and running, with the
   `claude --resume` line for each run. `wakectl logs -f` follows the log.

**How runs start, and what they may do.** `wakectl mode herdr` opens each
run as a tab in herdr's Wake workspace, an interactive session you can watch
and step into (headless when herdr isn't running); `wakectl mode headless`
is the default. `wakectl permissions` picks the permission mode:
`acceptEdits` (the default: anything outside the allowed tools asks, which
in herdr waits for you), `auto` (Claude Code's auto mode, or Cursor's
Auto-review, decides what is safe and asks about the rest), or `dontAsk`
(anything not allowed is denied, so a run never waits; Claude Code only, a
Cursor run keeps to its allowed list and asks).
`wakectl allow "Bash(npm test:*)"` adds a tool to the allowed list, and
`--remove` takes it back. `bypassPermissions` is never offered.

**Which tool, and where.** A pairing names the tool that runs its agent:
Claude Code, Codex or Cursor (`wakectl pair … --tool codex` when the app
cannot tell; the Codex CLI reaches Gatherd as ChatGPT). Each run's worktree
sits where its tool keeps its own: Claude Code's in the clone's
`.claude/worktrees`, Cursor's in `~/.cursor/worktrees/<repo>`, Codex's in
`~/.codex/worktrees/wake/<repo>`. A branch an earlier run already has
checked out is carried on in that folder, whichever tool made it, since git
checks a branch out once; a worktree folder you deleted by hand is forgotten
and made again. Interactive Codex asks whether to trust
each new folder; `wakectl trust codex on` has Wake add the run's worktree to
`~/.codex/config.toml` first, marked as Wake's, and `wakectl prune` takes it
out again. Cursor is started with `--trust` for the run's worktree, in herdr
as headless. If an agent in herdr stops on a question before it is ready,
Wake waits for you to answer it in the tab rather than failing the run.

`wakectl pause` stops new claims (a run already going finishes) and
`wakectl resume` goes on. `wakectl prune` removes run worktrees untouched
for 14 days, and keeps any with uncommitted work.

Place keys live in the macOS Keychain (`dev.abyssinia.wake`), never in the
config at `~/Library/Application Support/Wake/config.json`. Its settings:
`roots` (where to look for clones, `~/Projects` by default), `maxRuns` (2),
`runTimeoutMinutes` (120), and `extraAllowedTools` for a run.

## What a run does

For a ticket, Wake finds your clone of the repository the app names,
fetches, and makes a worktree on the ticket's branch where its tool keeps
worktrees (above). It starts the agent there with edits accepted and a
fixed tool list: git, `gh`, Bun and the app's MCP server. It may reply,
claim, commit, push its branch and open a pull request, and is told never
to merge, force-push or push the default branch. For a page, it runs in an
empty folder with the app's tools only.

## Security

**Turn on branch protection.** The tool lists and deny lists keep an
honest agent on track; they are not a wall. An agent with a shell can get
around a deny list, and text in a ticket can try to talk it into doing so.
What stops a push to your default branch, or a merge, is GitHub: a ruleset
on the default branch that requires a pull request and lets nobody bypass
it, admins included.

**What a run can reach.** Claude Code runs with Wake's settings only
(`--setting-sources user`): the branch's `.claude` settings and hooks are
not loaded, and the agent is told to read the repository's CLAUDE.md
itself. Its shell runs in Claude Code's sandbox: it writes only in the
worktree, connects only to GitHub and npm, and cannot read `~/.ssh`,
`~/.config/gh`, `~/.aws` or your other tools' credentials. `git push` for
the run's branch, `git fetch` and gh's pull request commands run outside
the sandbox; `gh api`, `gh auth`, `git -c`, `git config` and `bunx` are
denied. Cursor runs with `--sandbox enabled`: a command runs sandboxed
with no network, except the same short list that runs outside it. Cursor's
sandbox does not hide your credentials from a shell command, and Codex's
`workspace-write` sandbox reads anywhere and has network on, so for a
repository where that matters, pair Claude Code. Wake installs
dependencies with `--ignore-scripts`, and approves a Cursor run's MCP
servers only when the branch lists none of its own.

What Wake refuses on its own:

- A repository you haven't approved for the app (`wakectl repos`).
- A summons for the default branch, or for a branch checked out in a
  folder Wake didn't make (your own worktree, say).
- Anything from an app that isn't the shape `wake/v1` allows: discovery
  URLs that aren't https (http only for a dev server on this machine),
  an app name that isn't a plain name, unbounded ids, labels or prompts.
- A repository that ships its own `.cursor/cli.json`, or makes `.cursor`
  a link, for a Cursor run. Wake writes Cursor's limits fresh at every run.
- The clone's git hooks, when it makes a worktree.

Two runs on one branch take turns. When a run fails, the ticket says why
only in words written to be shared; paths and command output stay in
`wakectl logs`. Wake's config, state and log are readable by you alone.

## The contract

Wake knows each app only through `wake/v1`: discovery at
`/.well-known/wake`, two HTTP routes (`pair`, `forget`) and three Convex
functions (`wake:pending`, `wake:claim`, `wake:finish`), each called with
the place key as an argument. The key is the whole credential: nobody
signs in. The
full contract and the rules around it are the Wake pattern, kept word for
word in each app as `docs/product/wake-pattern.md`.

## Names

- Package: `@abyssinia-labs/wake` on npm
- Command: `wakectl` (`install`, `status`, `logs`, `pause`, `pair`, `forget`)
- Homebrew, later: `brew install abyssinia-labs/tap/wake`
