# Learn Anything V2 contributor map

V2 is an independent fork of Learn Anything. It preserves the original license and attribution, but its learning data is V2 state managed only through `learnctl`.

## Fast verification

```bash
pnpm lint
pnpm test
pnpm build # TypeScript build and typecheck
cd packages/cli
npm pack --dry-run
cd ../..
```

Use `node packages/cli/bin/learn-anything.js init <project>` to generate integrations and `node packages/cli/bin/learn-anything.js serve <project>` to run the dashboard locally.

## Architecture map

| Area                       | Location                                                                                                                                         | Responsibility                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| CLI and init               | `packages/cli/src/cli/index.ts`, `packages/cli/src/core/init.ts`                                                                                 | Parses commands, loads config, migrates before generation.       |
| Config and migration       | `packages/cli/src/core/learn-config.ts`, `packages/cli/src/core/learn-protocol/migrate.ts`, `packages/cli/src/core/learn-protocol/migrate-v2.ts` | `.learn/config.json`; V0 → V1 → V2 and V1 backup.                |
| State and schema           | `packages/cli/src/core/state-store/index.ts`, `packages/cli/src/core/learn-protocol/schema.ts`                                                   | Atomic revisioned state, locks, journal/recovery, V2 validation. |
| Runtime                    | `packages/cli/src/learnctl/index.ts`, `packages/cli/src/core/learning-engine/index.ts`                                                           | The sole canonical writer and deterministic learning plan.       |
| Scheduler                  | `packages/cli/src/core/learning-engine/scheduler.ts`                                                                                             | Replaceable FSRS-compatible scheduling boundary.                 |
| Dashboard API and site     | `packages/cli/src/dashboard-api.ts`, `packages/cli/site/`                                                                                        | Revisioned/idempotent writes and Mastery Ledger UI.              |
| Templates and integrations | `packages/cli/src/core/templates/`, `packages/cli/src/core/shared/`, `packages/cli/src/core/command-generation/`                                 | Seven workflows and tool-specific generated files.               |
| Locales                    | `packages/cli/src/i18n/`, `packages/cli/site/src/composables/locales/`                                                                           | `en`, `es`, `zh-CN` for CLI, skills, and dashboard.              |

## Invariants

- Canonical state is `.learn/topics/<slug>/state.json`; sessions are `sessions/<uuid>/session.json`. Maps and localized Markdown views are derived.
- Only `learnctl` writes canonical learning data. Skills, generated commands, and dashboard requests use its runtime/API boundary.
- Stable IDs are independent from derived display numbering. Mastery is derived from observed evidence, never declared by an agent.
- Writes carry an expected revision and idempotency key where the command/API requires them. Surface a conflict; do not overwrite stale state.
- `init`/`update` migrate V0 → V1 → V2 before integration generation. Invalid data or unsafe paths fail closed. `--force` affects generated integrations only.
- Codex and Hermes use `.agents/skills/`; OpenCode commands live in `.opencode/commands/`.

## Change guidance

Start from `v2`. Keep state changes covered by focused CLI tests, then run the verification block above. Do not reintroduce direct state-file editing in templates or the obsolete global Codex prompt location. For an upstreamable change, follow [UPSTREAM.md](./UPSTREAM.md).
