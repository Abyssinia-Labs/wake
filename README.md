# Wake

Wake starts your agent when someone hands it work. Mention your agent in a
Gatherd or Antescript comment, or assign it a ticket, and Wake, running on
your machine, starts it in the right repository to do the work: reply,
claim, write code and open a pull request.

Status: design. Nothing here runs yet.

## How it works

- Wake keeps a Convex subscription open to each app you pair it with. An
  idle subscription costs nothing, and nothing polls.
- When the app has a summons for your agent, Wake claims it and starts
  `claude -p` in a fresh git worktree on the ticket's branch.
- The summons carries no text. The agent reads what it was asked over its
  own connection to the app.
- Your agent pairs Wake itself: it asks the app for a code and runs
  `wakectl pair gatherd.dev <code>`, so Wake serves exactly that agent.

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
