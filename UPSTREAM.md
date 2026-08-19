# Upstream extraction

V2 is independent. When a change is broadly useful, extract it as one clean PR against a fresh HEAD of [ChenChenyaqi/learn-anything](https://github.com/ChenChenyaqi/learn-anything); do not transplant V2 branding, product docs, dashboard styling, or coupled migration/runtime work.

## Candidate seams

| Seam                             | Depend on                                                                               | Exclude from the upstream patch                    |
| -------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Atomic `StateStore` improvements | Generic lock, revision, atomic-write, journal, and recovery behavior that fits upstream | V2 schema, `learnctl`/runtime, and fork contracts. |
| Spanish and shared config        | Locale/config boundary                                                                  | V2-only state and dashboard behavior.              |
| Hermes standard skills           | Template generation conventions                                                         | Fork-specific workflow semantics.                  |
| OpenCode adapter                 | Command adapter registry                                                                | `.agents` conventions unrelated to OpenCode.       |

## Extraction checklist

1. Start from a clean, current upstream HEAD and restate the narrow behavior.
2. Copy only the minimal implementation and tests; preserve upstream naming and compatibility.
3. Run upstream lint, typecheck, tests, and build. Document any version-specific constraint.
4. Open one PR per seam with no V2 coupling. Do not create that PR from this repository by default.

Migration behavior, the `learnctl` canonical-writer model, V2 state, Mastery Ledger, and fork release metadata remain in this fork unless they can be independently specified and tested upstream.
