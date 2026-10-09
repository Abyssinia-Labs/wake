# Security

Wake starts coding agents on people's machines, so a flaw in it can reach
their repositories and credentials. Please report one privately.

## Reporting a vulnerability

Use GitHub's **Report a vulnerability** button on this repository's
Security tab. It opens a private advisory only the maintainers can see.
Please don't open a public issue, pull request or discussion about it.

Say what an attacker controls (a paired app, text in a ticket, a branch,
the network, another account on the Mac), what they gain, and how to
reproduce it. We'll answer within three working days, and credit you in
the advisory unless you'd rather not be named.

## What counts

Anything that lets a run do more than the README's Security section says
it may: escape the sandbox, read credentials, push the default branch,
run in a repository the person didn't approve, or run code from a branch
before the agent starts. So does anything that leaks a place key, or lets
an app send Wake a value that reaches a command line, a path or a
terminal unchecked.

A deny-list bypass on its own is expected: the lists keep an honest agent
on track, and branch protection on the repository is the fence that holds.
It counts when it gets past the sandbox or the repository's protection.

## Supported versions

The latest release on `main`. Wake is pre-1.0; fixes land there.
