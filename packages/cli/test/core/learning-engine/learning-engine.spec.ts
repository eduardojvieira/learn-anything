import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildStudyPlan,
  deriveMastery,
  deriveTopicMastery,
} from '../../../src/core/learning-engine/index.js';
import type { ConceptV2, EvidenceV2, StateV2 } from '../../../src/core/learn-protocol/types.js';

const timestamp = '2026-01-01T00:00:00.000Z';
const evidence = (
  kind: EvidenceV2['kind'],
  score: number,
  extra: Partial<EvidenceV2> = {},
): EvidenceV2 => ({
  id: randomUUID(),
  kind,
  score,
  source: 'learnctl',
  predicted_score: null,
  review_rating: null,
  observed_at: timestamp,
  session_id: null,
  feedback: null,
  corrected: false,
  delay_days: null,
  ...extra,
});

function concept(overrides: Partial<ConceptV2> = {}): ConceptV2 {
  return {
    id: randomUUID(),
    name: 'Concept',
    slug: 'concept',
    details: [],
    prerequisites: [],
    relations: [],
    evidence: [],
    calibration: { predicted_score: null, observed_score: null, samples: 0, updated_at: null },
    review: {
      state: 'new',
      due_at: null,
      last_reviewed_at: null,
      stability: 0,
      difficulty: 5,
      scheduled_days: 0,
      elapsed_days: 0,
      reps: 0,
      lapses: 0,
      learning_steps: 0,
    },
    ...overrides,
  };
}

function state(concepts: ConceptV2[]): StateV2 {
  return {
    version: 2,
    id: randomUUID(),
    topic: 'Topic',
    slug: 'topic',
    created_at: timestamp,
    updated_at: timestamp,
    domains: [{ id: randomUUID(), name: 'One', slug: 'one', concepts }],
  };
}

describe('mastery', () => {
  it('never masters from migration evidence and requires all non-migration gates', () => {
    expect(
      deriveMastery(concept({ evidence: [evidence('practice', 1, { source: 'migration' })] }))
        .status,
    ).not.toBe('mastered');
    const ready = concept({
      evidence: [
        evidence('retrieval', 0.9),
        evidence('practice', 0.9),
        evidence('transfer', 0.9),
        evidence('delayed_assessment', 0.9, { delay_days: 2 }),
      ],
    });
    expect(deriveMastery(ready).status).toBe('mastered');
    ready.evidence[0] = evidence('retrieval', 0.2, {
      corrected: false,
      observed_at: '2026-01-02T00:00:00.000Z',
    });
    expect(deriveMastery(ready).status).not.toBe('mastered');
  });

  it('gates a mastered concept on its prerequisites', () => {
    const prerequisite = concept();
    const dependent = concept({
      prerequisites: [prerequisite.id],
      evidence: [
        evidence('retrieval', 0.9),
        evidence('practice', 0.9),
        evidence('transfer', 0.9),
        evidence('delayed_assessment', 0.9, { delay_days: 2 }),
      ],
    });
    expect(deriveTopicMastery(state([prerequisite, dependent]))[dependent.id].status).not.toBe(
      'mastered',
    );
  });
});

describe('study plan', () => {
  it('covers initial diagnostics, low-score feedback/correction, and progress movements', () => {
    const fresh = concept();
    const weak = concept({
      evidence: [evidence('practice', 0.3, { feedback: 'missed case', corrected: false })],
    });
    const progressing = concept({ evidence: [evidence('practice', 0.8)] });
    const kinds = buildStudyPlan(state([fresh, weak, progressing]), '2026-01-03T00:00:00.000Z').map(
      (step) => step.kind,
    );
    for (const kind of [
      'diagnostic',
      'retrieval',
      'self_explanation',
      'practice',
      'feedback',
      'correction',
      'interleave',
      'transfer',
      'delayed_assessment',
    ]) {
      expect(kinds).toContain(kind);
    }
  });

  it('offers delayed assessment only after two full days since the latest non-migration evidence', () => {
    const progressing = concept({ evidence: [evidence('practice', 0.8)] });
    const before = buildStudyPlan(state([progressing]), '2026-01-02T23:59:59.999Z').map(
      (step) => step.kind,
    );
    const atLimit = buildStudyPlan(state([progressing]), '2026-01-03T00:00:00.000Z').map(
      (step) => step.kind,
    );

    expect(before).not.toContain('delayed_assessment');
    expect(atLimit).toContain('delayed_assessment');

    const migrationOnly = concept({
      evidence: [evidence('practice', 0.8, { source: 'migration' })],
    });
    expect(
      buildStudyPlan(state([migrationOnly]), '2026-01-04T00:00:00.000Z').map((step) => step.kind),
    ).not.toContain('delayed_assessment');
  });

  it('holds scheduled practice until due but keeps weak-evidence feedback and correction immediate', () => {
    const scheduled = concept({
      evidence: [evidence('practice', 0.3, { feedback: 'missed', corrected: false })],
      review: {
        state: 'review',
        due_at: '2026-01-04T00:00:00.000Z',
        last_reviewed_at: timestamp,
        stability: 3,
        difficulty: 5,
        scheduled_days: 3,
        elapsed_days: 0,
        reps: 1,
        lapses: 0,
        learning_steps: 0,
      },
    });
    const early = buildStudyPlan(state([scheduled]), '2026-01-03T00:00:00.000Z').map(
      (step) => step.kind,
    );
    const due = buildStudyPlan(state([scheduled]), '2026-01-04T00:00:00.000Z').map(
      (step) => step.kind,
    );

    expect(early).toEqual(['feedback', 'correction']);
    expect(due).toContain('retrieval');
  });

  it('does not interleave a concept whose review is not due', () => {
    const available = concept({ evidence: [evidence('practice', 0.8)] });
    const anotherAvailable = concept({ evidence: [evidence('practice', 0.8)] });
    const future = concept({
      evidence: [evidence('practice', 0.8)],
      review: {
        state: 'review',
        due_at: '2026-01-04T00:00:00.000Z',
        last_reviewed_at: timestamp,
        stability: 3,
        difficulty: 5,
        scheduled_days: 3,
        elapsed_days: 0,
        reps: 1,
        lapses: 0,
        learning_steps: 0,
      },
    });
    const interleaved = buildStudyPlan(
      state([available, anotherAvailable, future]),
      '2026-01-03T00:00:00.000Z',
    )
      .filter((step) => step.kind === 'interleave')
      .map((step) => step.concept_id);

    expect(interleaved).toContain(available.id);
    expect(interleaved).toContain(anotherAvailable.id);
    expect(interleaved).not.toContain(future.id);
  });
});
