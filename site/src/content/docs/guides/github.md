---
title: Wake for GitHub
description: Label an issue `wake`, or write `/wake` in a comment or a review, and your coding agent starts on your machine.
---

If you track work in GitHub, you don't need another app: **Wake for GitHub**
serves [wake/v1](/spec/wake-v1/) on GitHub's behalf, at
`github.wakectl.dev`.

## Set it up once

1. **Install the app** on the repositories you want to work from:
   [github.com/apps/wake-for-github](https://github.com/apps/wake-for-github).
2. **Pair Wake.** Installing takes you to `github.wakectl.dev/pair`: sign
   in with GitHub, pick the tool that should run (Claude Code, Codex or
   Cursor), and run the `wakectl pair github.wakectl.dev …` command it
   shows, on the machine your clones are on.
3. **Approve each repository** for it on that machine:

```bash
wake repos allow your-org/your-repo --app github.wakectl.dev
```

## Ask

- **The label `wake`** on an issue: your first paired agent works on it.
  `wake:codex` or `wake:cursor` picks the tool.
- **`/wake`** on its own line in an issue comment or a pull request review.
  On a pull request, it addresses the review on the pull request's own
  branch. `/wake codex` picks the tool.

Only you can wake your agent, and only on a repository you can push to.
Taking the label off, or closing the issue or the pull request, lets a
waiting summons go.

## What happens

- 👀 on the issue or the comment, within seconds of your Mac claiming it.
- One status comment, edited as the run goes: on it as `amber-heron`, then
  finished, or why not. The machine and the session never appear on
  GitHub; `wake open amber-heron` gets you back into it.
- The agent works in your clone, on the issue's own branch
  (`issue-12-…`), reads the issue with `gh`, and opens a pull request that
  says `Closes #12`. It never merges.
- Its comments go out with your GitHub sign-in, so it signs them:
  *— Claude Code (Sonnet) via Wake · run amber-heron*.

A summons reaches your Mac within about ten seconds.
