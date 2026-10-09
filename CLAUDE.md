# CLAUDE.md — working standards

Wake is the client half of the Wake pattern: a listener on a person's Mac
that starts their agent when an app that serves `wake/v1` summons it. It
names no app: the README, help and examples stay product-neutral. The
pattern began with Abyssinia Labs' Gatherd and Antescript, as
`docs/product/wake-pattern.md` in each (Gatherd D-43, Antescript D-58),
kept word for word in both. Wake knows the apps only through `wake/v1`,
whose text is `docs/spec/wake-v1.md`; it imports no app's code.

The repository holds both halves: the command (`src/`, published as
`@abyssinia-labs/wake`) and the server half as a Convex component
(`packages/convex`, `@abyssinia-labs/wake-convex`, tested with vitest and
convex-test). A change to the contract is a change to the spec first, then
to `src/contract.ts`, `packages/convex/src/component/shape.ts` and the
pattern in each app, together. `wakectl check <domain>` tests an app
against the spec.

## Toolchain

- **Bun** runs everything: `bun install`, `bun run <script>`, `bunx <cli>`.
  Never `npm`, `npx`, `pnpm` or `yarn`. `bun.lock` is committed.
- Exact pins, as the apps: `"convex": "1.45.0"`, not `^`.
- Scripts: `bun test`, `bun run typecheck` (TypeScript 7 `tsc`),
  `bun run lint` (Biome), `bun run format`, `bun run wakectl <command>`.
- Published to npm as `@abyssinia-labs/wake` (owner's call, 2026-10-09).
  A release is a `vX.Y.Z` tag matching `package.json`; the release
  workflow publishes it through npm's trusted publishing. Never publish
  from a machine.

## Code standards

- At most 300 lines a file; 350 is the ceiling. Split by responsibility.
- TypeScript `strict`, no `any`, no non-null assertions. Exported functions
  have explicit return types. Anything read from the network is `unknown`
  until a guard in `src/contract.ts` has narrowed it.
- Files `kebab-case`. Biome is the only formatter and linter.
- Output goes through `src/log.ts`, never `console.log`.
- Comments say why, not what. Cite the pattern's section when a choice
  looks odd.
- Side effects (git, launchctl, claude, the Keychain, the network) sit
  behind small functions so the logic around them is tested with fakes.

## Rules a run keeps (the pattern's "What a run may do")

- A summons carries no text; the agent reads it over its own connection.
- A run may reply, claim, edit, commit, push its branch and open a pull
  request. It never merges, never pushes the default branch, never uses
  `bypassPermissions`. The disallowed-tools list in `src/claude.ts` is a
  second fence, not the only one: branch protection is the real one.
- At most two runs at once. Worktrees are kept so `claude --resume` works
  from the same folder; `wakectl prune` removes old ones.

## Git

Imperative subjects under 72 characters; the body says why. Keep the
`Co-Authored-By` trailer on AI-assisted commits.

## Definition of done

`bun test`, `bun run typecheck` and `bun run lint` pass; no file over the
ceiling; the README says what changed for a person using `wakectl`.
