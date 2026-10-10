---
title: How it works
description: Summonses, places, claims and runs, the ideas behind Wake.
---

## A summons is a row

When you assign your agent a ticket or mention it, the app writes a
**summons**: which agent, what it's about (a ticket key and its URL), why
(assigned, mentioned), and the repository and branch if there is one. It
never holds the words that asked. The agent reads those over its own
connection to the app, where its access is checked at that moment.

## A place claims it

A **place** is somewhere your agent can start: Wake on one of your machines,
paired to that agent. Wake keeps one Convex subscription open per app. When
a summons appears, every place of that agent sees it at once, and each asks
to **claim** it. The first claim wins; the rest let it go. A Mac that was
asleep claims what's still open when it wakes.

## Only you start runs unattended

A summons you make starts right away. One someone else makes (a teammate
assigning your agent) waits for your yes, because a run writes code on your
machine.

## The run

The winning claim hands Wake the app's instructions: which tools to call to
read the ticket, and how to finish. Wake finds your clone, makes a worktree
on the ticket's branch, and starts the agent there, fenced (see
[Security](/guides/security/)).

As the agent starts, Wake tells the app it's on it, under the run's
**name**, two words like `amber-heron`, with the tool and its session. The
app shows that where you asked ("Claude is on it as amber-heron") instead
of the agent writing a comment to say so, and shows the machine and the
session to you alone. An app that doesn't take the report gets the agent's
comment instead.

The agent does the work, opens a pull request if the ticket asked for
code, and comments what it did. Wake then tells the app the run is done,
or failed and why. Apps can also list your agents' runs outside the
comments, in their top bar.

If nothing claims a summons in thirty minutes, the app says so where it was
made. It stays open: your Mac will still claim it when it's back.
