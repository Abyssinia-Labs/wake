# Wake for GitHub

Wake's GitHub bridge (WAK-4): it serves [wake/v1](../../docs/spec/wake-v1.md)
on GitHub's behalf, so a person who tracks work in GitHub wakes their coding
agent from an issue or a review, with no other app. Hosted at
`github.wakectl.dev`; self-hostable. MIT.

## What a person does

1. **Installs the GitHub App** on their repositories.
2. **Signs in with GitHub** at `/pair`, picks a tool (Claude Code, Codex,
   Cursor) and runs the `wakectl pair github.wakectl.dev …` command it shows.
3. **Asks**: the label `wake` on an issue, or `/wake` on its own line in an
   issue comment or a pull request review. `wake:codex` / `/wake cursor`
   picks the tool; otherwise the first one they paired runs.

Their agent starts on their machine, in their clone, on the issue's branch
(`issue-12-…`) or the pull request's own, inside Wake's sandbox. It reads
what was asked with `gh`, never from the summons, and opens a pull request
that `Closes #12`. The issue gets 👀, then one status comment edited as the
run goes: on it as `amber-heron`, then finished or why not.

Only the person who asked is woken, and only on a repository they can push
to. A review on a fork's pull request is refused (the branch isn't theirs to
push). Closing the issue or the pull request, or taking the label off, lets
a waiting summons go.

## How it is built

One Fetch handler (`src/app.ts`), so it runs on Workers, Bun or Node:

- `/api/wake/v1/*`: wake/v1 over HTTP, from
  [`@abyssinia-labs/wake-server`](../../packages/server) on Drizzle.
- `/.well-known/wake`: discovery, `transport: "http"`.
- `/github/webhook`: GitHub's events, checked against the webhook secret
  (`src/webhook.ts`).
- `/`, `/pair`, `/auth/*`: the pages, and signing in with the app's own
  GitHub user authorization. A signed cookie holds the user's id and login;
  nothing else is kept about them.
- Wake's run hooks write the status comment (`src/hooks.ts`), through an
  installation token (`src/github.ts`, the app's JWT signed with Web Crypto).

Agents are `gh-<user id>-<tool>`; owners `gh-<user id>`; the scope is the
installation, so uninstalling the app deletes its summonses.

## The GitHub App

`github-app.json` is its settings, for GitHub's
[manifest flow](https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest):
Issues read and write (reactions and the status comment), Pull requests and
Metadata read; events: issues, issue comments, pull requests, reviews and
review comments.

| Setting | Where it comes from |
| --- | --- |
| `GITHUB_APP_ID`, `GITHUB_APP_SLUG` | The app's settings page |
| `GITHUB_PRIVATE_KEY` | A private key generated there (PKCS#1 as GitHub gives it is fine) |
| `GITHUB_WEBHOOK_SECRET` | The webhook secret you set |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | The app's client id and a client secret |
| `SESSION_SECRET` | Any long random string |
| `ORIGIN` | Where it is served |

## Run it

```bash
bun run --cwd apps/github dev
```

with the settings above and `ORIGIN` set to a tunnel GitHub can reach.
Then `wake check <your host>`.

## Hosting

`createBridge(db, config)` takes any Drizzle Postgres database. Create the
tables with `WAKE_TABLES_SQL` and `GITHUB_TABLES_SQL` (or drizzle-kit, from
`wakePlaces`, `wakeCodes`, `wakeSummonses` and `githubAsks`). On a host with
a request time limit, set `maxStreamMs` under it.
