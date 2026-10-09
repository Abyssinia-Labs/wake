# Wake

Wake starts your coding agent when someone hands it work. Mention your
agent in a comment, or assign it a ticket, in an app that speaks
`wake/v1`, and Wake, running on your Mac,
starts it in the right repository: Claude Code, Codex or Cursor, in the
background or in a [herdr](https://herdr.dev) tab you can watch. The agent
replies, claims the work, writes code and opens a pull request, inside a
sandbox and on its own branch.

Status: early, and in daily use. macOS only. Docs, and the apps that support Wake, are coming to
[wakectl.dev](https://wakectl.dev).

## How it works

- Wake keeps a Convex subscription open to each app you pair it with. An
  idle subscription costs nothing, and nothing polls.
- When the app has a summons for your agent, Wake claims it, makes a git
  worktree on the ticket's branch, and starts the agent there.
- The summons carries no text. The agent reads what it was asked over its
  own connection to the app, so the app checks access as on any call.
- Your agent pairs Wake itself: it asks the app for a code and runs
  `wakectl pair <app domain> <code>`, so Wake serves exactly that agent.

## Requirements

macOS, [Bun](https://bun.sh) 1.3.3 or later, git, and at least one of
Claude Code (`claude`), Codex (`codex`) or Cursor (`cursor-agent`), signed
in to the app's MCP server. `gh` for pull requests.

## Using it

```bash
bun add -g @abyssinia-labs/wake
wakectl setup
```

Or from source: clone this repository, then `bun install` and `bun link`,
which puts `wakectl` on your PATH.

Then run **`wakectl setup`**. It checks the machine (Bun, git, gh, which
agents you have), asks where your clones are, pairs your agent, asks which
repositories each app may run in, how runs should open and what they may
do unasked, and starts the listener. Run it again any time; every answer
also has its own command:

1. **Pair.** In Claude Code, Codex or Cursor, with the app's MCP server
   connected, ask your agent to pair Wake. It answers with
   `wakectl pair <app domain> <code>`.
2. **Approve repositories.** `wakectl repos allow your-org/your-repo` lets
   the app run there on this machine. A summons for a repository you
   haven't approved is refused, and the ticket says the command. Setup
   lists first the repositories the app has asked for before, and asks you
   to confirm before approving more than ten at once: approve only what the
   app should work in.
3. **Listen.** `wakectl install` starts the listener now and at every
   login, as a LaunchAgent (`dev.abyssinia.wake`), with the PATH of the
   shell you ran it from, so it finds your agents, `git` and `gh`.
4. **Check.** `wakectl status` shows what is paired, connected and
   running, with the resume line for each run; `wakectl logs -f` follows
   the log; `wakectl doctor` lists anything missing, with its fix.

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
cannot tell: the Codex CLI often reaches an app as ChatGPT). Each run's worktree
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

## For apps: serve wake/v1

Any app can let Wake start its users' agents by serving `wake/v1`:
discovery at `/.well-known/wake`, two HTTP routes (`pair`, `forget`) and
three Convex functions (`wake:pending`, `wake:claim`, `wake:finish`), each
called with the place key as an argument.

- **The spec**: [docs/spec/wake-v1.md](docs/spec/wake-v1.md).
- **On Convex**: [`@abyssinia-labs/wake-convex`](packages/convex) is the
  whole server half as a component. You decide what summons an agent and
  write the prompt.
- **Check it**: `wakectl check <your domain>` probes an app the way Wake
  will, with inputs it must refuse, so it pairs nothing and changes nothing.

## Names

- Packages: `@abyssinia-labs/wake` (the command) and `@abyssinia-labs/wake-convex` (the Convex component), on npm
- Command: `wakectl` (`install`, `status`, `logs`, `pause`, `pair`, `forget`)
- Homebrew, later: `brew install abyssinia-labs/tap/wake`

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report a vulnerability privately,
as [SECURITY.md](SECURITY.md) says, never in an issue.

## License

[MIT](LICENSE) © Abyssinia Labs LLC
