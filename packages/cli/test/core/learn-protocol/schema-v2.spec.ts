import { describe, expect, it } from 'vitest';
import {
  deriveNumbering,
  stateV2Schema,
  validateStateV2,
} from '../../../src/core/learn-protocol/index.js';

const ids = {
  topic: '00000000-0000-4000-8000-000000000001',
  domain: '00000000-0000-4000-8000-000000000002',
  conceptA: '00000000-0000-4000-8000-000000000003',
  conceptB: '00000000-0000-4000-8000-000000000004',
  detail: '00000000-0000-4000-8000-000000000005',
  evidence: '00000000-0000-4000-8000-000000000006',
  session: '00000000-0000-4000-8000-000000000007',
};

function validState() {
  return {
    version: 2,
    id: ids.topic,
    topic: 'TypeScript',
    slug: 'typescript',
    created_at: '2026-01-01T10:00:00.000Z',
    updated_at: '2026-01-02T10:00:00.000Z',
    domains: [
      {
        id: ids.domain,
        name: 'Basics',
        slug: 'basics',
        concepts: [
          {
            id: ids.conceptA,
            name: 'Types',
            slug: 'types',
            details: [{ id: ids.detail, name: 'Unions', slug: 'unions' }],
            prerequisites: [],
            relations: [{ kind: 'related', target_id: ids.conceptB }],
            evidence: [
              {
                id: ids.evidence,
                kind: 'diagnostic',
                observed_at: '2026-01-01T11:00:00.000Z',
                score: 0.5,
                source: 'learnctl',
                predicted_score: null,
                review_rating: null,
                session_id: ids.session,
                feedback: 'Initial baseline',
                corrected: false,
                delay_days: null,
              },
            ],
            calibration: {
              predicted_score: null,
              observed_score: null,
              samples: 0,
              updated_at: null,
            },
            review: review(),
          },
          concept(ids.conceptB, 'Narrowing', 'narrowing'),
        ],
      },
    ],
  };
}

function concept(id: string, name: string, slug: string) {
  return {
    id,
    name,
    slug,
    details: [],
    prerequisites: [],
    relations: [],
    evidence: [],
    calibration: { predicted_score: null, observed_score: null, samples: 0, updated_at: null },
    review: review(),
  };
}

function review() {
  return {
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
  };
}

describe('stateV2Schema', () => {
  it('accepts the complete V2 shape', () => {
    expect(validateStateV2(validState()).success).toBe(true);
  });

  it('rejects unknown fields, invalid UUIDs, and timestamps without offsets', () => {
    const unknown = validState();
    (unknown as Record<string, unknown>).status = 'mastered';
    expect(stateV2Schema.safeParse(unknown).success).toBe(false);

    const invalid = validState();
    invalid.id = 'topic';
    invalid.created_at = '2026-01-01T10:00:00';
    expect(stateV2Schema.safeParse(invalid).success).toBe(false);
  });

  it('rejects duplicate IDs and evidence IDs', () => {
    const duplicate = validState();
    duplicate.domains[0].concepts[1].id = ids.conceptA;
    expect(stateV2Schema.safeParse(duplicate).success).toBe(false);

    const evidence = validState();
    evidence.domains[0].concepts[1].evidence.push({
      ...evidence.domains[0].concepts[0].evidence[0],
    });
    expect(stateV2Schema.safeParse(evidence).success).toBe(false);
  });

  it('rejects dangling, self-referential, and cyclic prerequisites', () => {
    const dangling = validState();
    dangling.domains[0].concepts[0].prerequisites = ['00000000-0000-4000-8000-000000000099'];
    expect(stateV2Schema.safeParse(dangling).success).toBe(false);

    const self = validState();
    self.domains[0].concepts[0].prerequisites = [ids.conceptA];
    expect(stateV2Schema.safeParse(self).success).toBe(false);

    const cyclic = validState();
    cyclic.domains[0].concepts[0].prerequisites = [ids.conceptB];
    cyclic.domains[0].concepts[1].prerequisites = [ids.conceptA];
    expect(stateV2Schema.safeParse(cyclic).success).toBe(false);
  });

  it('rejects dangling and duplicate relations', () => {
    const dangling = validState();
    dangling.domains[0].concepts[0].relations[0].target_id = '00000000-0000-4000-8000-000000000099';
    expect(stateV2Schema.safeParse(dangling).success).toBe(false);

    const duplicate = validState();
    duplicate.domains[0].concepts[0].relations.push({ kind: 'related', target_id: ids.conceptB });
    expect(stateV2Schema.safeParse(duplicate).success).toBe(false);

    const self = validState();
    self.domains[0].concepts[0].relations[0].target_id = ids.conceptA;
    expect(stateV2Schema.safeParse(self).success).toBe(false);
  });

  it('enforces evidence time and calibration invariants', () => {
    const early = validState();
    early.domains[0].concepts[0].evidence[0].observed_at = '2025-12-31T23:00:00.000Z';
    expect(stateV2Schema.safeParse(early).success).toBe(false);

    const staleUpdate = validState();
    staleUpdate.updated_at = '2025-12-31T23:00:00.000Z';
    expect(stateV2Schema.safeParse(staleUpdate).success).toBe(false);

    const emptyCalibration = validState();
    emptyCalibration.domains[0].concepts[0].calibration.predicted_score = 0.5;
    expect(stateV2Schema.safeParse(emptyCalibration).success).toBe(false);

    const incompleteCalibration = validState();
    incompleteCalibration.domains[0].concepts[0].calibration = {
      predicted_score: 0.5,
      observed_score: null,
      samples: 1,
      updated_at: '2026-01-02T10:00:00.000Z',
    };
    expect(stateV2Schema.safeParse(incompleteCalibration).success).toBe(false);
  });

  it('rejects evidence and calibration newer than the state watermark', () => {
    const evidence = validState();
    evidence.domains[0].concepts[0].evidence[0].observed_at = '2026-01-03T00:00:00.000Z';
    const evidenceResult = stateV2Schema.safeParse(evidence);
    expect(evidenceResult.success).toBe(false);
    if (!evidenceResult.success)
      expect(
        evidenceResult.error.issues.some(
          (issue) => issue.path.join('.') === 'domains.0.concepts.0.evidence.0.observed_at',
        ),
      ).toBe(true);

    const calibration = validState();
    calibration.domains[0].concepts[0].calibration = {
      predicted_score: 0.5,
      observed_score: 0.5,
      samples: 1,
      updated_at: '2026-01-03T00:00:00.000Z',
    };
    const calibrationResult = stateV2Schema.safeParse(calibration);
    expect(calibrationResult.success).toBe(false);
    if (!calibrationResult.success)
      expect(
        calibrationResult.error.issues.some(
          (issue) => issue.path.join('.') === 'domains.0.concepts.0.calibration.updated_at',
        ),
      ).toBe(true);
  });

  it('enforces shared evidence feedback and delay invariants', () => {
    const lowScore = validState();
    lowScore.domains[0].concepts[0].evidence[0].score = 0.7;
    lowScore.domains[0].concepts[0].evidence[0].feedback = null;
    expect(stateV2Schema.safeParse(lowScore).success).toBe(false);

    const corrected = validState();
    corrected.domains[0].concepts[0].evidence[0].corrected = true;
    corrected.domains[0].concepts[0].evidence[0].feedback = null;
    expect(stateV2Schema.safeParse(corrected).success).toBe(false);

    const delayed = validState();
    delayed.domains[0].concepts[0].evidence[0].kind = 'delayed_assessment';
    expect(stateV2Schema.safeParse(delayed).success).toBe(false);

    const immediate = validState();
    immediate.domains[0].concepts[0].evidence[0].delay_days = 1;
    expect(stateV2Schema.safeParse(immediate).success).toBe(false);
  });

  it('enforces review counters and review timestamps', () => {
    const fresh = validState();
    fresh.domains[0].concepts[0].review.reps = 1;
    expect(stateV2Schema.safeParse(fresh).success).toBe(false);

    const reviewed = validState();
    reviewed.domains[0].concepts[0].review = {
      ...review(),
      state: 'review',
      reps: 1,
      last_reviewed_at: '2026-01-02T00:00:00.000Z',
      due_at: '2026-01-01T00:00:00.000Z',
    };
    expect(stateV2Schema.safeParse(reviewed).success).toBe(false);

    const newWithHistory = validState();
    newWithHistory.domains[0].concepts[0].review = {
      ...review(),
      reps: 1,
      last_reviewed_at: '2026-01-02T00:00:00.000Z',
      due_at: '2026-01-03T00:00:00.000Z',
    };
    expect(stateV2Schema.safeParse(newWithHistory).success).toBe(false);
  });

  it('rejects impossible review counters while accepting a reviewed card', () => {
    const reviewed = validState();
    reviewed.domains[0].concepts[0].review = {
      ...review(),
      state: 'review',
      due_at: '2026-01-03T00:00:00.000Z',
      last_reviewed_at: '2026-01-02T00:00:00.000Z',
      stability: 3,
      scheduled_days: 3,
      elapsed_days: 1,
      reps: 1,
    };
    expect(stateV2Schema.safeParse(reviewed).success).toBe(true);

    const reviewWithoutReps = validState();
    reviewWithoutReps.domains[0].concepts[0].review.state = 'review';
    expect(stateV2Schema.safeParse(reviewWithoutReps).success).toBe(false);

    for (const field of [
      'scheduled_days',
      'elapsed_days',
      'lapses',
      'learning_steps',
      'stability',
    ] as const) {
      const freshWithCounter = validState();
      freshWithCounter.domains[0].concepts[0].review[field] = 1;
      expect(stateV2Schema.safeParse(freshWithCounter).success).toBe(false);
    }

    const reviewWithSteps = validState();
    reviewWithSteps.domains[0].concepts[0].review = {
      ...reviewed.domains[0].concepts[0].review,
      learning_steps: 1,
    };
    expect(stateV2Schema.safeParse(reviewWithSteps).success).toBe(false);

    const tooManyLapses = validState();
    tooManyLapses.domains[0].concepts[0].review = {
      ...reviewed.domains[0].concepts[0].review,
      lapses: 2,
    };
    expect(stateV2Schema.safeParse(tooManyLapses).success).toBe(false);

    const tooManySteps = validState();
    tooManySteps.domains[0].concepts[0].review = {
      ...reviewed.domains[0].concepts[0].review,
      state: 'learning',
      learning_steps: 2,
    };
    expect(stateV2Schema.safeParse(tooManySteps).success).toBe(false);
  });
});

describe('deriveNumbering', () => {
  it('derives numbering without mutating identity fields and follows array order', () => {
    const state = validState();
    const before = structuredClone(state);
    expect(deriveNumbering(state)).toEqual({
      [ids.domain]: '1',
      [ids.conceptA]: '1.1',
      [ids.detail]: '1.1.1',
      [ids.conceptB]: '1.2',
    });
    expect(state).toEqual(before);

    state.domains[0].concepts.reverse();
    expect(deriveNumbering(state)[ids.conceptB]).toBe('1.1');
    expect(deriveNumbering(state)[ids.conceptA]).toBe('1.2');
  });
});
