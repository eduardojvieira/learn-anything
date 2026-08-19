#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
die() { printf 'release preflight: %s\n' "$*" >&2; exit 1; }

cd "$ROOT"
[ -z "$(git status --porcelain)" ] || die 'working tree must be clean'
[ "$(git branch --show-current)" = v2 ] || die 'must run on branch v2'

pnpm lint
pnpm test
pnpm build
(cd packages/cli && npm pack --dry-run)
