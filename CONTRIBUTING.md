# Contributing to Learn Anything V2

Contribute to this independent fork through `v2`. The original project has its own history and review path; see [UPSTREAM.md](./UPSTREAM.md) for intentionally small upstream proposals.

## Quick path

```bash
git checkout v2
git pull --ff-only
git checkout -b feat/short-description
# make and verify the change
git commit -m "feat(scope): short description"
git push -u origin feat/short-description
```

Open a pull request to `v2`. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, or `ci`, with an optional scope.

## Before requesting review

```bash
pnpm lint
pnpm test
pnpm build # TypeScript build and typecheck
cd packages/cli
npm pack --dry-run
cd ../..
```

Keep a change focused, include a regression test for behavioral changes, and update the relevant user documentation. Do not assume branch protection or release automation beyond these checks.

## Releases

`./scripts/release.sh` is a non-publishing preflight: it validates a clean `v2` worktree, lint, tests, build, and package contents. npm publication is deliberately blocked until this fork has a package identity. Do not tag, publish, or create a release as part of ordinary contribution work.

## Attribution

Keep the original logo, MIT license, and author attribution intact. Keep fork-specific work clearly separated from a PR intended for [the original project](https://github.com/ChenChenyaqi/learn-anything).
