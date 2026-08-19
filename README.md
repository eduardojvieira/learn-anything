<p align="center">
  <img src="./logo.png" alt="Learn Anything logo" width="120" />
</p>

# Learn Anything V2

[English](./README.md) · [Español](./README.es.md) · [中文](./README.zh-CN.md)

An independent V2 fork of [ChenChenyaqi/learn-anything](https://github.com/ChenChenyaqi/learn-anything). It keeps the original MIT license and attribution while making learning data durable, revisioned, and local-first. The CLI package is currently private: install and run it from this repository’s `v2` branch.

## Quick path

```bash
git clone --branch v2 https://github.com/eduardojvieira/learn-anything.git
cd learn-anything
pnpm install
pnpm build

# Generate integrations for a learning project, then start the dashboard.
node packages/cli/bin/learn-anything.js init ../my-project --tools claude --lang en
node packages/cli/bin/learn-anything.js serve ../my-project --no-open
```

The server prints `http://localhost:24278` (or the next free port). LAN access is intentional: use `http://<your-LAN-IP>:24278` only on a trusted local network. It has no authentication layer.

## Learn with seven workflows

`/learn:study` is the primary workflow: it asks the deterministic runtime for the next step. The remaining workflows are focused entry points.

| Workflow                    | Purpose                                               |
| --------------------------- | ----------------------------------------------------- |
| `/learn:study [topic]`      | Plan and record the next deterministic learning step. |
| `/learn:topic <topic>`      | Create or inspect a V2 topic.                         |
| `/learn:explain <concept>`  | Run a persistent Socratic explanation.                |
| `/learn:practice <concept>` | Record observed practice and correction.              |
| `/learn:review [topic]`     | Work through due retrieval review.                    |
| `/learn:status [topic]`     | Read the derived mastery ledger and next step.        |
| `/learn:quiz <concept>`     | Run and assess a persistent retrieval quiz.           |

The slash form is shown consistently, but Codex and Hermes are skills-only integrations: invoke the matching skill or ask in natural language when their host does not expose slash commands.

## What V2 guarantees

`learnctl` is the only canonical writer. Agents and the dashboard read snapshots and send revisioned requests; they never edit canonical learning files directly.

- `StateStore` uses locks, compare-and-swap revisions, atomic writes, a journal, and recovery.
- Topics have stable IDs. Display numbering (`1`, `1.1`, `1.1.1`) is derived, not stored in names, slugs, or IDs.
- State records prerequisites, relations, evidence, calibration, and review state. Mastery is derived from evidence; an AI cannot set it arbitrarily.
- The learning engine covers diagnosis, retrieval, self-explanation, feedback, correction, spacing, interleaving, transfer, and delayed assessment. Its scheduler is behind a replaceable FSRS-compatible interface; V2 does not claim to implement FSRS itself.

### Canonical data and derived views

```text
.learn/
├── config.json                         # locale, timezone, numbering
└── topics/<slug>/
    ├── state.json                       # canonical V2 topic state
    ├── state.v1.json.bak                # only created by V1 → V2 migration
    ├── knowledge-map.md                 # derived view
    └── sessions/<uuid>/
        ├── session.json                 # canonical session
        └── views/{en,es,zh-CN}.md       # derived localized views
```

Do not treat legacy Markdown, exercises, or quizzes as canonical state.

## Dashboard and integrations

`serve` opens the Mastery Ledger: a paper-and-serif view of derived mastery, canonical sessions, and editable Socratic responses. Dashboard writes use revisions (`If-Match`) and idempotency keys, so stale updates become explicit conflicts instead of silent overwrites.

All generated integrations call `learnctl`. Codex and Hermes install standard skills under `.agents/skills/`; OpenCode receives real commands under `.opencode/commands/`; other supported tools keep their existing skills/adapters. English, Spanish, and Simplified Chinese (`en`, `es`, `zh-CN`) share `.learn/config.json` across the CLI, skills, and dashboard.

`init` and `update` chain V0 → V1 → V2 migration before generating integrations. V1 state is backed up, reruns are idempotent, and invalid state or unsafe paths abort generation. `learnctl migrate` remains available for advanced runtime use. `--force` only replaces generated integration files; it never bypasses state validation or symlink/escape protections.

## Development

```bash
pnpm lint
pnpm test
pnpm build
cd packages/cli
npm pack --dry-run
cd ../..
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the fork workflow and [UPSTREAM.md](./UPSTREAM.md) for extracting focused improvements to the original project.

## License and attribution

[MIT](./LICENSE) © [yaqi chen](https://github.com/ChenChenyaqi). V2 is maintained as the [eduardojvieira/learn-anything](https://github.com/eduardojvieira/learn-anything) fork; the original project remains [ChenChenyaqi/learn-anything](https://github.com/ChenChenyaqi/learn-anything).
