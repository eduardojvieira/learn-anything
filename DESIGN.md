---
name: Learn Anything
description: A calm local study workspace rendered as an operational academic folio.
colors:
  paper: '#f1e9d2'
  paper-alt: '#ebe2cb'
  paper-surface: '#f7f1df'
  ledger-ink: '#3e435d'
  pencil: '#545464'
  muted-pencil: '#696875'
  rule: '#cfc6b4'
  utility-indigo: '#4d699b'
  red-pencil: '#c84053'
  mastery-moss: '#526c3a'
  practice-ochre: '#945b22'
typography:
  display:
    fontFamily: 'Noto Serif, Noto Serif CJK SC, Songti SC, Georgia, serif'
    fontSize: 'clamp(2rem, 3.2vw, 3rem)'
    fontWeight: 500
    lineHeight: 1.05
  body:
    fontFamily: 'Noto Serif, Noto Serif CJK SC, Songti SC, Georgia, serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.75
  label:
    fontFamily: 'Noto Serif, Noto Serif CJK SC, Songti SC, Georgia, serif'
    fontSize: '0.75rem'
    fontWeight: 600
  mono:
    fontFamily: 'ui-monospace, Cascadia Code, Fira Code, JetBrains Mono, SF Mono, Menlo, Monaco, Consolas, monospace'
rounded:
  small: '4px'
spacing:
  compact: '8px'
  standard: '16px'
  panel: '20px'
  canvas: '28px'
components:
  button-primary:
    backgroundColor: '{colors.utility-indigo}'
    textColor: '#ffffff'
    rounded: '0'
    padding: '8px 24px'
  search-trigger:
    backgroundColor: '{colors.paper-surface}'
    textColor: '{colors.muted-pencil}'
    rounded: '0'
    padding: '6px 12px'
  ledger-row:
    backgroundColor: '{colors.paper-surface}'
    textColor: '{colors.ledger-ink}'
    rounded: '0'
    padding: '17px 20px'
  dialog:
    backgroundColor: '{colors.paper-surface}'
    textColor: '{colors.ledger-ink}'
    rounded: '0'
---

# Design System: Learn Anything

## Overview

**Creative North Star: "Mastery Ledger"**

Learn Anything is an operational academic folio: a calm, dense study workspace built from archival paper, deep ink, and visible ledger rules. It supports local, evidence-led learning with editorial restraint rather than SaaS ceremony.

The paper texture is CSS-native and deliberately low contrast. Functional color marks real study state while the interface stays primarily paper and ink. Keyboard operation remains explicit through square controls, semantic labels, and a visible focus outline.

**Key Characteristics:**

- Archival paper surfaces and low-contrast fiber marks.
- Serif-first reading and tabular numeric evidence.
- Flat, ruled structure instead of card-wall elevation.
- Functional indigo, coral, moss, and ochre accents.

## Colors

Warm paper and ledger ink carry the interface; the colored marks are reserved for navigation, intervention, and learning evidence.

### Primary

- **Utility Indigo:** navigation, links, selected search states, and primary actions use `utility-indigo`.

### Secondary

- **Red-Pencil Coral:** the visible focus outline, caret, and urgent review signals use `red-pencil`.

### Tertiary

- **Mastery Moss:** evidence-backed mastery and completed progress use `mastery-moss`.
- **Practice Ochre:** in-progress or low-confidence learning evidence uses `practice-ochre`.

### Neutral

- **Kanagawa Lotus Paper:** `paper`, `paper-alt`, and `paper-surface` form the archival field and tonal layers.
- **Deep Ledger Ink:** `ledger-ink`, `pencil`, and `muted-pencil` establish readable text hierarchy.
- **Restrained Rules:** `rule` divides rails, ledgers, dialogs, and reading sections.

**The Functional Accent Rule.** Reserve colored marks for a state, action, or evidence category; paper, ink, and rules do the structural work.

## Typography

**Display Font:** Noto Serif, with Noto Serif CJK SC, Songti SC, and Georgia fallbacks.
**Body Font:** Noto Serif, with the same multilingual serif fallback stack.
**Label/Mono Font:** ui-monospace with the configured code-family fallbacks.

**Character:** The type system reads like an academic folio: measured serif prose and headings, with monospace limited to code and keyboard hints.

### Hierarchy

- **Display** (500, `clamp(2rem, 3.2vw, 3rem)`, `1.05`): page-level ledger headings.
- **Headline** (500–600, `28px`, `40px`): primary document headings.
- **Title** (500–600, `20px–24px`, `28px–32px`): section and topic titles.
- **Body** (400, `1rem`, `1.75`): interface copy and instructional prose; long-form reading is constrained to `72ch`.
- **Label** (600, `0.75rem`, uppercase tracking where used): compact ledger headings and metadata.

**The Reading Measure Rule.** Keep pedagogical prose at the established `72ch` measure; use the wider canvas for navigation and evidence, not longer lines of study text.

## Layout

The desktop shell uses a 36px utility strip above a 244px ruled rail, with a generous central canvas. The dashboard becomes a two-column ledger—fluid evidence and topic directory beside a 400px review column—then reduces to one column before mobile. The mobile rail becomes a drawer, while controls retain a 44px menu target.

Spacing follows a compact editorial rhythm: 8px for inline detail, 16px for ordinary separation, 20px for panel interiors, and 28px for the desktop canvas. Topic rows and review rows are full-width ruled records rather than isolated cards.

## Elevation & Depth

This is a flat, structural system. There are no shadows or blur in the shell or dialogs; 1px rules, paper-toned layers, and the low-contrast CSS paper texture distinguish regions. Hover is a faint indigo tonal wash, not physical lift.

**The Flat Ledger Rule.** Convey hierarchy with borders, typography, and tonal paper surfaces; do not introduce drop shadows or backdrop blur.

## Shapes

The operational surfaces are square: buttons, fields, modal shells, progress rails, and ledger rows resolve to zero radius. The small radius remains for inline code and local detail, but it does not define the folio's primary silhouette. Circular dots are reserved for compact status marks.

**The Ruled Edge Rule.** Use square boundaries and 1px rules for workspace structure; reserve rounding for small local affordances where the implementation already uses it.

## Components

### Buttons

**Character:** Quiet controls with clear state, never promotional chrome.

- **Shape:** square (`0` on operational controls).
- **Primary:** utility-indigo fill with white text and `8px 24px` padding.
- **Hover / Focus:** hover darkens toward the existing utility indigo variant; `:focus-visible` uses a 2px red-pencil outline with a 3px offset.
- **Secondary / Ghost:** paper-toned controls use text, border, and a light tonal hover rather than a filled alternate action.

### Inputs / Fields

**Character:** ruled entry points that stay part of the paper field.

- **Style:** paper background, 1px rule border, and square corners.
- **Focus:** border changes to utility indigo; the global visible focus treatment remains available for keyboard navigation.
- **Caret:** red-pencil coral.

### Navigation

**Character:** a persistent study rail, not an application chrome sidebar.

- **Style:** a 244px ruled paper rail under the utility strip, with uppercase rail title and square search trigger.
- **State:** selected search results use a paper-soft accent wash and a 1px indigo bar.
- **Mobile:** the rail translates into a drawer and is opened by a 44px square menu control.

### Cards / Containers

**Character:** ledger regions, not floating cards.

- **Corner Style:** square on the workspace surfaces.
- **Background:** paper-surface over the archival paper field.
- **Shadow Strategy:** none; boundaries are 1px rules and tonal surfaces.
- **Internal Padding:** use the established panel rhythm, including 20px ledger headers and 17px × 20px topic rows.

### Mastery Ledger

**Character:** evidence expressed as a segmented rule and compact tabular counts.

- **Structure:** moss, ochre, indigo, and muted-ink segments represent existing concept states.
- **Shape:** straight 6px and 10px progress rules without rounded ends.
- **Motion:** existing progress changes animate over 500ms and are subject to the project's reduced-motion treatment.

### Review Ledger

**Character:** a stable ruled queue with compact reason dots.

- **Structure:** full-width 68px rows separated by 1px rules, reducing to 58px on small screens.
- **Signals:** an 8px reason dot carries urgency; no thick colored rail is used.
- **Hover:** a restrained indigo tonal wash preserves the document-like density.

## Do's and Don'ts

- **Do** use paper tone, ink hierarchy, and 1px rules before adding decoration.
- **Do** reserve serif for interface and learning prose, and mono for code and keyboard hints.
- **Do** keep interaction states keyboard-visible with the established red-pencil focus outline.
- **Do** use the CSS-native paper texture as an optional tonal layer only.
- **Don't** use shadows, blur, or floating card-wall compositions for the core workspace.
- **Don't** use colored accents as decoration; attach them to navigation, action, or evidence.
- **Don't** let long-form instructional prose exceed the established reading measure.
- **Don't** make the texture necessary for legibility or contrast.
