---
version: 1
slug: 'packages-cli-site-src-app-vue'
primary_target: 'packages/cli/site/src/App.vue'
related_targets:
  ['packages/cli/site/src/views/Dashboard.vue', 'packages/cli/site/src/views/TopicPage.vue']
---

## Scope and mode

Refresh the existing Vue application shell, dashboard, and reading surfaces without changing data flow, routes, API behavior, or the normative V2 implementation sequence. Primary mode: **Operate** on the dashboard; topic content preserves a **Read**-optimized measure inside the same world.

## Audience, job, and action

Eduardo needs to scan real mastery evidence, choose a topic or suggested review, and read learning material comfortably from desktop or LAN mobile. The first viewport must expose global progress, the topic directory, and the review queue without a marketing hero.

## Direction

**Mastery Ledger — serif paper edition.** Adapt Homelab Mission Control's Shoji structure into an academic folio: Kanagawa Lotus paper, deep blue ink, coral/green functional signals, square 1px rules, Noto Serif-compatible typography, and restrained archival-paper texture. The approved composition is `.impeccable/mocks/mastery-ledger-serif-paper.png`.

The memorable moment is the full-width mastery ledger resolving immediately into the three real topic rows, with the review queue held as a stable contextual column.

## Constraints

- Preserve current functionality, keyboard operation, localization, dark mode, loading/empty/error states, and data truth.
- No new dependency, remote font, invented metric, new API, or canonical-state write.
- Mobile must remove the current menu/title collision and translate the desk into a usable drawer plus single-column sheet.
- Long pedagogical prose remains comfortably readable; serif is the primary voice, with existing mono reserved for code and keyboard hints.
- Paper texture must be CSS-native, low-contrast, and nonessential; content contrast cannot depend on it.

## Fidelity inventory

| Comp ingredient               | Production medium                                      | Commitment                                                           |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| Warm archival-paper field     | CSS colors plus subtle layered noise-free fiber marks  | Visible at full resolution, never dirty or contrast-reducing         |
| Top utility strip and LA mark | Semantic HTML/CSS                                      | 36px ruled strip; no leaked numeric navigation                       |
| Topic rail                    | Existing Vue sidebar + CSS                             | 230–250px ruled rows, square search, stable footer                   |
| Mastery overview              | Existing stats components + CSS                        | First major panel, segmented real-data rule and three summary cells  |
| Topic directory               | Existing topic buttons + CSS                           | Three dense full-width rows with metadata and progress at right      |
| Suggested review ledger       | Existing review component + CSS                        | Context column, compact rows, 8px reason dots, no thick colored edge |
| Type system                   | Local `Noto Serif`, `Noto Serif CJK`, Georgia fallback | Scholarly, multilingual, readable; tabular numerals enabled          |
| Topic/article reading         | Existing semantic HTML and Markdown renderer           | Centered sheet, 65–75ch body measure, code stays monospace           |

## Unresolved decisions

None for this visual unit. Scheduler-backed semantics and write interactions remain in their original V2 phases.
