# Contributing

Thanks for helping. Wake is small and opinionated, so open an issue before
a large change and we'll agree on the shape first.

## Setup

```bash
bun install
bun test
bun run typecheck
bun run lint
```

The Convex component in `packages/convex` has its own checks, run with
vitest in the edge runtime as Convex runs functions:

```bash
bun run --cwd packages/convex test
bun run --cwd packages/convex typecheck
```

[Bun](https://bun.sh) runs everything: never `npm`, `npx`, `pnpm` or
`yarn`. Dependencies are pinned exactly and `bun.lock` is committed.

## Standards

[CLAUDE.md](CLAUDE.md) holds the working standards, for people and agents
alike. In short:

- At most 300 lines a file. TypeScript `strict`, no `any`, no non-null
  assertions, explicit return types on exported functions.
- Anything from the network is `unknown` until a guard in
  `src/contract.ts` narrows it.
- Side effects (git, launchctl, the agents, the Keychain, the network) sit
  behind small functions, so the logic around them is tested with fakes.
- Comments say why, not what.

A change to `wake/v1` is a change to the specification first; open an
issue for it.

## Pull requests

`bun test`, `bun run typecheck` and `bun run lint` pass, and the README
says what changed for a person using `wakectl`. Commit subjects are
imperative and under 72 characters; the body says why.
