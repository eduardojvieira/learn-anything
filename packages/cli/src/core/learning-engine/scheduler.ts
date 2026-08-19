import type { ReviewRating, ReviewV2 } from '../learn-protocol/types.js';
import { z } from 'zod';

const DAY_MS = 86_400_000;
const AGAIN_MS = 10 * 60_000;
const ratings: ReviewRating[] = ['again', 'hard', 'good', 'easy'];
const offsetTimestamp = z.iso.datetime({ offset: true });
const DATE_PARTS = /^(\d{4})-(\d{2})-(\d{2})T/;

export interface ReviewLog {
  rating: ReviewRating;
  reviewed_at: string;
  due_at: string;
  scheduled_days: number;
  state: ReviewV2['state'];
}

export interface ReviewResult {
  rating: ReviewRating;
  card: ReviewV2;
  log: ReviewLog;
}

export interface SpacedRepetitionScheduler {
  preview(card: ReviewV2, reviewedAt: string): ReviewResult[];
  review(card: ReviewV2, reviewedAt: string, rating: ReviewRating): ReviewResult;
}

export class ReviewOutOfOrderError extends Error {
  constructor() {
    super('Assessment timestamp precedes the last review');
    this.name = 'ReviewOutOfOrderError';
  }
}

export class ReviewTimestampError extends Error {
  constructor() {
    super('Invalid review timestamp');
    this.name = 'ReviewTimestampError';
  }
}

/** Deterministic baseline scheduler; its interface, not its formula, maps to FSRS-style ratings. */
export class BasicScheduler implements SpacedRepetitionScheduler {
  preview(card: ReviewV2, reviewedAt: string): ReviewResult[] {
    return ratings.map((rating) => this.review(card, reviewedAt, rating));
  }

  review(card: ReviewV2, reviewedAt: string, rating: ReviewRating): ReviewResult {
    const reviewedMs = parseTimestamp(reviewedAt);
    const lastMs = card.last_reviewed_at === null ? null : parseTimestamp(card.last_reviewed_at);
    if (lastMs !== null && reviewedMs < lastMs) throw new ReviewOutOfOrderError();

    const first = card.reps === 0;
    const elapsed_days = lastMs === null ? 0 : Math.floor((reviewedMs - lastMs) / DAY_MS);
    const base = Math.max(1, card.scheduled_days || 1);
    const scheduled_days =
      rating === 'again'
        ? 0
        : rating === 'hard'
          ? first
            ? 1
            : Math.max(1, Math.round(base * 1.2))
          : rating === 'good'
            ? first
              ? 3
              : Math.max(2, Math.round(base * 2))
            : first
              ? 7
              : Math.max(4, Math.round(base * 3));
    const dueMs = reviewedMs + (rating === 'again' ? AGAIN_MS : scheduled_days * DAY_MS);
    const state =
      rating === 'again'
        ? card.state === 'new'
          ? 'learning'
          : 'relearning'
        : rating === 'hard'
          ? card.state === 'review'
            ? 'review'
            : 'learning'
          : 'review';
    const difficultyDelta =
      rating === 'again' ? 1 : rating === 'hard' ? 0.5 : rating === 'good' ? -0.25 : -1;
    const reviewedIso = new Date(reviewedMs).toISOString();
    const dueIso = new Date(dueMs).toISOString();
    const next: ReviewV2 = {
      ...card,
      state,
      due_at: dueIso,
      last_reviewed_at: reviewedIso,
      stability: rating === 'again' ? Math.max(0.1, card.stability * 0.5) : scheduled_days,
      difficulty: Math.min(10, Math.max(1, card.difficulty + difficultyDelta)),
      scheduled_days,
      elapsed_days,
      reps: card.reps + 1,
      lapses: card.lapses + (rating === 'again' && card.state !== 'new' ? 1 : 0),
      learning_steps:
        rating === 'again' || (rating === 'hard' && card.state !== 'review')
          ? card.learning_steps + 1
          : 0,
    };
    return {
      rating,
      card: next,
      log: {
        rating,
        reviewed_at: reviewedIso,
        due_at: dueIso,
        scheduled_days: next.scheduled_days,
        state: next.state,
      },
    };
  }
}

function parseTimestamp(value: string): number {
  if (!offsetTimestamp.safeParse(value).success) throw new ReviewTimestampError();
  const parts = value.match(DATE_PARTS);
  const milliseconds = Date.parse(value);
  const calendar =
    parts === null
      ? null
      : new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  if (
    Number.isNaN(milliseconds) ||
    calendar === null ||
    calendar.getUTCFullYear() !== Number(parts![1]) ||
    calendar.getUTCMonth() !== Number(parts![2]) - 1 ||
    calendar.getUTCDate() !== Number(parts![3])
  )
    throw new ReviewTimestampError();
  return milliseconds;
}
