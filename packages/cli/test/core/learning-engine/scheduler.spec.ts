import { describe, expect, it } from 'vitest';
import {
  BasicScheduler,
  ReviewTimestampError,
} from '../../../src/core/learning-engine/scheduler.js';
import type { ReviewV2 } from '../../../src/core/learn-protocol/types.js';

const reviewedAt = '2026-01-01T00:00:00.000Z';
const card = (): ReviewV2 => ({
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
});

describe('BasicScheduler', () => {
  it('previews all four deterministic ratings without mutating the card', () => {
    const scheduler = new BasicScheduler();
    const initial = card();
    const preview = scheduler.preview(initial, reviewedAt);

    expect(initial).toEqual(card());
    expect(
      preview.map((option) => [
        option.rating,
        option.card.due_at,
        option.card.scheduled_days,
        option.card.state,
        option.card.learning_steps,
      ]),
    ).toEqual([
      ['again', '2026-01-01T00:10:00.000Z', 0, 'learning', 1],
      ['hard', '2026-01-02T00:00:00.000Z', 1, 'learning', 1],
      ['good', '2026-01-04T00:00:00.000Z', 3, 'review', 0],
      ['easy', '2026-01-08T00:00:00.000Z', 7, 'review', 0],
    ]);
  });

  it('updates counters, clamps difficulty, and rejects out-of-order reviews', () => {
    const scheduler = new BasicScheduler();
    const prior: ReviewV2 = {
      state: 'review',
      due_at: '2026-01-04T00:00:00.000Z',
      last_reviewed_at: '2026-01-01T00:00:00.000Z',
      stability: 3,
      difficulty: 9.8,
      scheduled_days: 3,
      elapsed_days: 0,
      reps: 2,
      lapses: 2,
      learning_steps: 0,
    };
    const hard = scheduler.review(prior, '2026-01-03T00:00:00.000Z', 'hard');
    expect(hard.card).toMatchObject({
      state: 'review',
      due_at: '2026-01-07T00:00:00.000Z',
      last_reviewed_at: '2026-01-03T00:00:00.000Z',
      scheduled_days: 4,
      stability: 4,
      difficulty: 10,
      elapsed_days: 2,
      reps: 3,
      lapses: 2,
      learning_steps: 0,
    });
    expect(hard.log).toEqual({
      rating: 'hard',
      reviewed_at: '2026-01-03T00:00:00.000Z',
      due_at: '2026-01-07T00:00:00.000Z',
      scheduled_days: 4,
      state: 'review',
    });
    const learning = { ...prior, state: 'learning' as const, reps: 4, learning_steps: 4 };
    expect(scheduler.review(learning, '2026-01-03T00:00:00.000Z', 'again').card).toMatchObject({
      state: 'relearning',
      due_at: '2026-01-03T00:10:00.000Z',
      stability: 1.5,
      difficulty: 10,
      scheduled_days: 0,
      reps: 5,
      lapses: 3,
      learning_steps: 5,
    });
    expect(scheduler.review(learning, '2026-01-03T00:00:00.000Z', 'hard').card.learning_steps).toBe(
      5,
    );
    expect(scheduler.review(learning, '2026-01-03T00:00:00.000Z', 'good').card.learning_steps).toBe(
      0,
    );
    expect(scheduler.review(learning, '2026-01-03T00:00:00.000Z', 'easy').card.learning_steps).toBe(
      0,
    );
    expect(() => scheduler.review(prior, '2025-12-31T23:59:59.999Z', 'good')).toThrow();
    expect(() => scheduler.review(card(), '2026-01-01T00:00:00', 'good')).toThrow(
      ReviewTimestampError,
    );
    expect(() => scheduler.review(card(), '2026-02-30T00:00:00.000Z', 'good')).toThrow(
      ReviewTimestampError,
    );
    expect(() =>
      scheduler.review({ ...prior, last_reviewed_at: 'not-a-timestamp' }, reviewedAt, 'good'),
    ).toThrow(ReviewTimestampError);
  });
});
