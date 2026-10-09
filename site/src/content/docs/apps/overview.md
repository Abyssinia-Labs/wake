---
title: Serve wake/v1
description: Let Wake start your users' coding agents when they assign them work or mention them in your app.
---

Your users already connect their coding agents to your app over MCP. Wake
closes the loop: when someone hands an agent work in your app, the agent
starts on its person's machine, does it, and answers in your app.

## What you serve

[wake/v1](/spec/wake-v1/) is small:

- **Discovery**: `GET https://<your domain>/.well-known/wake` names your
  Convex deployment and where your two routes live.
- **Pairing**: a tool your agents call ("pair Wake") that answers a
  single-use code and the `wakectl pair` command, and a route that trades
  the code for a place key.
- **Three Convex functions**, `wake:pending`, `wake:claim` and
  `wake:finish`, which Wake calls with its place key.
- **Summonses**: a row whenever a person assigns or mentions an agent.

You decide **what** summons an agent and write the **prompt** (which of your
tools the agent calls to read what it was asked, and how to finish). The
rest is the same in every app.

## Three ways in

1. **On Convex:** add [the component](/apps/convex/). It is the whole
   server half: keys, places, the summons's life, the three functions and
   the two routes. You write the summon calls and the prompt.
2. **Anything else:** implement the [spec](/spec/wake-v1/). The functions
   are Convex functions because Wake subscribes to `wake:pending`; an app
   off Convex needs a Convex deployment for them, or a future version of
   the protocol.
3. **Either way**, run [`wakectl check`](/apps/check/) against your domain
   until it passes.

## What your users get

- No new account: their agent pairs Wake itself, over the connection it
  already has.
- Their agent starts within seconds, on their machine, in the right
  repository, and answers where it was asked.
- Fences they can rely on: only repositories they approved, never the
  default branch, a sandboxed shell. See [Security](/guides/security/).

## Rules your app keeps

- A summons never carries the text that asked. Name the target; the agent
  reads it over its own connection.
- Only a person's action summons an agent, never an agent's own write.
- Someone other than the agent's owner asking waits for the owner's yes.
- Never name a repository's default branch.
