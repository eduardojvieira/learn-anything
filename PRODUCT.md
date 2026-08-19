# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Eduardo is the primary user. He studies AI-assisted topics from his desktop and from other devices on the local network, and needs to resume the exact next learning step without losing prior work. Broader distribution and multi-user support remain undecided.

## Product Purpose

Learn Anything V2 is an independent product based on the upstream fork. It turns AI-assisted study into a durable local workflow: structure a topic, run evidence-based study sessions, preserve canonical state, and make the next review or intervention clear. Success means learning history remains recoverable and the interface never represents mastery that the recorded evidence does not support.

## Positioning

Unlike a collection of agent prompts that edit learning files directly, V2 puts a deterministic local runtime between agents, the dashboard, and canonical state. This makes the same study record usable across supported agents while retaining explicit conflicts, recovery, evidence-derived mastery, and replaceable scheduling.

## Operating Context

- The CLI and dashboard run locally inside a learner-owned workspace.
- `learnctl` is the deterministic mutation boundary for canonical learning data.
- The dashboard remains deliberately reachable over the local network.
- AI agents guide diagnostic, retrieval, explanation, practice, correction, transfer, and delayed evaluation activities.
- The current implementation is a pnpm TypeScript monorepo with a Vue dashboard and a Node HTTP server.

## Capabilities and Constraints

- Preserve the normative V2 implementation order: integrity, schema, runtime, learning engine, scheduler, sessions, API/dashboard, Spanish, agent integrations, then hardening and release.
- Canonical state and sessions must use stable IDs, revision control, atomic writes, recovery, and explicit conflicts.
- Mastery is derived from typed evidence; neither an AI agent nor the dashboard may set it arbitrarily.
- Markdown is a localized derived view, not canonical session state.
- Preserve LAN access while securing future write operations.
- Support Spanish through shared project configuration, Hermes through standard skills, and OpenCode through real command adapters.
- Do not publish, deploy, migrate production data, or change release identity without explicit authorization.
- The visual refresh is an intermediate, behavior-preserving unit; implementation resumes at the scheduler immediately afterward.

## Brand Commitments

- Keep the current Learn Anything name until fork release identity is decided explicitly.
- Preserve upstream attribution and the MIT license.
- The Homelab Mission Control dashboard at `/home/eduardo/Documents/Repositorios/Homelab/homelab-dashboard` is the binding visual reference for this refresh. Adapt its language to learning rather than cloning its content or operational semantics.

## Evidence on Hand

- The V2 technical specification supplied by Eduardo is the normative product scope.
- Existing CLI, Vue dashboard, server, tests, and topic fixtures live under `packages/cli/`.
- The accepted V2 implementation in the working tree contains the transactional store, schema, migration, and local runtime.
- The Homelab reference includes `PRODUCT.md`, `DESIGN.md`, working source, and reviewed desktop/mobile captures.
- No public usage claims, learner testimonials, mastery outcomes, or product benchmarks are available; future work must not fabricate them.

## Product Principles

1. Protect learning state before adding presentation or convenience.
2. Make evidence and the next useful study action clearer than aggregate vanity metrics.
3. Keep canonical mutations deterministic, recoverable, and independent of any one AI agent.
4. Prefer calm, keyboard-friendly local operation over SaaS ceremony.
5. Keep modules small enough to extract cleanly for focused upstream proposals.

## Accessibility & Inclusion

Preserve keyboard operation, visible focus, semantic labels, readable contrast, reduced-motion behavior, responsive access, dark mode, and localized interface text.
