import { z } from 'zod';

// ---- Helpers -----------------------------------------------------------

/** Datetime: YYYY-MM-DD or YYYY-MM-DD HH:mm:ss. */
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}):(\d{2}))?$/;

/**
 * Verify a regex-matched datetime has components that form a real calendar
 * moment (month 01-12, valid day-of-month incl. leap years, hh/mm/ss in range).
 * Mirrors the check in src/scripts/utils.mts.
 */
function isValidCalendarDate(s: string): boolean {
  const m = s.match(DATE_RE);
  if (!m) return false;
  const Y = +m[1];
  const M = +m[2];
  const D = +m[3];
  const H = m[4] !== undefined ? +m[4] : 0;
  const MI = m[5] !== undefined ? +m[5] : 0;
  const S = m[6] !== undefined ? +m[6] : 0;
  const d = new Date(Y, M - 1, D, H, MI, S, 0);
  return (
    d.getFullYear() === Y &&
    d.getMonth() === M - 1 &&
    d.getDate() === D &&
    d.getHours() === H &&
    d.getMinutes() === MI &&
    d.getSeconds() === S
  );
}

const dateTimeStr = () =>
  z
    .string()
    .regex(DATE_RE, 'Expected YYYY-MM-DD or YYYY-MM-DD HH:mm:ss')
    .refine(isValidCalendarDate, 'Invalid calendar date');
const nullableDateTimeStr = () => dateTimeStr().nullable();

// ---- Concept schema ----------------------------------------------------

const conceptSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  status: z.enum(['unexplored', 'in_progress', 'needs_practice', 'mastered']),
  confidence: z.number().min(0).max(1),
  practice_count: z.number().int().min(0),
  explain_count: z.number().int().min(0),
  last_explained: nullableDateTimeStr(),
  last_practiced: nullableDateTimeStr(),
  details: z.array(z.string()),
});

// ---- Domain schema -----------------------------------------------------

const domainSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  concepts: z.array(conceptSchema),
});

// ---- Top-level StateV1 schema ------------------------------------------

export const stateV1Schema = z.object({
  version: z.literal(1),
  topic: z.string().min(1),
  slug: z.string().min(1),
  created: dateTimeStr(),
  domains: z.array(domainSchema),
});

export type StateV1Schema = z.infer<typeof stateV1Schema>;

// ---- Validation result type --------------------------------------------

export type ValidationResult =
  | { success: true; data: StateV1Schema }
  | { success: false; errors: z.ZodIssue[] };

// ---- Public API ---------------------------------------------------------

/** Validate an unknown value against the StateV1 schema. */
export function validateStateV1(value: unknown): ValidationResult {
  const result = stateV1Schema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error.issues };
}

// ---- StateV2 -----------------------------------------------------------

const isoDateTime = () => z.iso.datetime({ offset: true });
const nullableIsoDateTime = () => isoDateTime().nullable();
const uuid = () => z.uuid();

const detailV2Schema = z
  .object({ id: uuid(), name: z.string().min(1), slug: z.string().min(1) })
  .strict();

const relationV2Schema = z
  .object({ kind: z.enum(['related', 'contrast', 'analogy', 'application']), target_id: uuid() })
  .strict();

const evidenceV2Schema = z
  .object({
    id: uuid(),
    kind: z.enum([
      'diagnostic',
      'retrieval',
      'self_explanation',
      'practice',
      'quiz',
      'transfer',
      'delayed_assessment',
    ]),
    observed_at: isoDateTime(),
    score: z.number().min(0).max(1),
    source: z.enum(['learnctl', 'dashboard', 'agent', 'migration']),
    predicted_score: z.number().min(0).max(1).nullable(),
    review_rating: z.enum(['again', 'hard', 'good', 'easy']).nullable(),
    session_id: uuid().nullable(),
    feedback: z.string().nullable(),
    corrected: z.boolean(),
    delay_days: z.number().int().min(0).nullable(),
  })
  .strict()
  .superRefine((evidence, ctx) => {
    const feedbackPath = ['feedback'];
    if (evidence.score < 0.8 && !evidence.feedback?.trim()) {
      ctx.addIssue({ code: 'custom', path: feedbackPath, message: 'Low scores require feedback' });
    }
    if (evidence.corrected && !evidence.feedback?.trim()) {
      ctx.addIssue({ code: 'custom', path: feedbackPath, message: 'Corrections require feedback' });
    }
    if (evidence.kind === 'delayed_assessment' && evidence.delay_days === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['delay_days'],
        message: 'Delayed assessments require delay_days',
      });
    }
    if (evidence.kind !== 'delayed_assessment' && evidence.delay_days !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['delay_days'],
        message: 'Only delayed assessments may have delay_days',
      });
    }
  });

const calibrationV2Schema = z
  .object({
    predicted_score: z.number().min(0).max(1).nullable(),
    observed_score: z.number().min(0).max(1).nullable(),
    samples: z.number().int().min(0),
    updated_at: nullableIsoDateTime(),
  })
  .strict();

const reviewV2Schema = z
  .object({
    state: z.enum(['new', 'learning', 'review', 'relearning']),
    due_at: nullableIsoDateTime(),
    last_reviewed_at: nullableIsoDateTime(),
    stability: z.number().min(0),
    difficulty: z.number().min(1).max(10),
    scheduled_days: z.number().int().min(0),
    elapsed_days: z.number().int().min(0),
    reps: z.number().int().min(0),
    lapses: z.number().int().min(0),
    learning_steps: z.number().int().min(0),
  })
  .strict();

const conceptV2Schema = z
  .object({
    id: uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
    details: z.array(detailV2Schema),
    prerequisites: z.array(uuid()),
    relations: z.array(relationV2Schema),
    evidence: z.array(evidenceV2Schema),
    calibration: calibrationV2Schema,
    review: reviewV2Schema,
  })
  .strict();

const domainV2Schema = z
  .object({
    id: uuid(),
    name: z.string().min(1),
    slug: z.string().min(1),
    concepts: z.array(conceptV2Schema),
  })
  .strict();

export const stateV2Schema = z
  .object({
    version: z.literal(2),
    id: uuid(),
    topic: z.string().min(1),
    slug: z.string().min(1),
    created_at: isoDateTime(),
    updated_at: isoDateTime(),
    domains: z.array(domainV2Schema),
  })
  .strict()
  .superRefine((state, ctx) => {
    const entityIds = new Set<string>();
    const evidenceIds = new Set<string>();
    const concepts = state.domains.flatMap((domain) => domain.concepts);
    const conceptIds = new Set(concepts.map((concept) => concept.id));
    const createdAt = Date.parse(state.created_at);
    const updatedAt = Date.parse(state.updated_at);

    const uniqueEntity = (id: string, path: (string | number)[]) => {
      if (entityIds.has(id)) ctx.addIssue({ code: 'custom', path, message: `Duplicate ID: ${id}` });
      entityIds.add(id);
    };
    uniqueEntity(state.id, ['id']);
    state.domains.forEach((domain, domainIndex) => {
      uniqueEntity(domain.id, ['domains', domainIndex, 'id']);
      domain.concepts.forEach((concept, conceptIndex) => {
        uniqueEntity(concept.id, ['domains', domainIndex, 'concepts', conceptIndex, 'id']);
        concept.details.forEach((detail, detailIndex) =>
          uniqueEntity(detail.id, [
            'domains',
            domainIndex,
            'concepts',
            conceptIndex,
            'details',
            detailIndex,
            'id',
          ]),
        );
        concept.evidence.forEach((evidence, evidenceIndex) => {
          if (evidenceIds.has(evidence.id)) {
            ctx.addIssue({
              code: 'custom',
              path: [
                'domains',
                domainIndex,
                'concepts',
                conceptIndex,
                'evidence',
                evidenceIndex,
                'id',
              ],
              message: `Duplicate evidence ID: ${evidence.id}`,
            });
          }
          evidenceIds.add(evidence.id);
          if (Date.parse(evidence.observed_at) < createdAt) {
            ctx.addIssue({
              code: 'custom',
              path: [
                'domains',
                domainIndex,
                'concepts',
                conceptIndex,
                'evidence',
                evidenceIndex,
                'observed_at',
              ],
              message: 'Evidence predates the topic',
            });
          }
          if (Date.parse(evidence.observed_at) > updatedAt) {
            ctx.addIssue({
              code: 'custom',
              path: [
                'domains',
                domainIndex,
                'concepts',
                conceptIndex,
                'evidence',
                evidenceIndex,
                'observed_at',
              ],
              message: 'Evidence exceeds the state watermark',
            });
          }
        });
        const calibrationUpdatedAt = concept.calibration.updated_at;
        if (calibrationUpdatedAt !== null && Date.parse(calibrationUpdatedAt) > updatedAt) {
          ctx.addIssue({
            code: 'custom',
            path: ['domains', domainIndex, 'concepts', conceptIndex, 'calibration', 'updated_at'],
            message: 'Calibration exceeds the state watermark',
          });
        }
        const review = concept.review;
        const reviewPath = ['domains', domainIndex, 'concepts', conceptIndex, 'review'] as (
          | string
          | number
        )[];
        if (review.reps === 0) {
          if (review.state !== 'new')
            ctx.addIssue({
              code: 'custom',
              path: [...reviewPath, 'state'],
              message: 'Unreviewed cards must be new',
            });
          if (review.last_reviewed_at !== null)
            ctx.addIssue({
              code: 'custom',
              path: [...reviewPath, 'last_reviewed_at'],
              message: 'Unreviewed cards cannot have review timestamps',
            });
          if (review.due_at !== null)
            ctx.addIssue({
              code: 'custom',
              path: [...reviewPath, 'due_at'],
              message: 'Unreviewed cards cannot have review timestamps',
            });
          for (const field of [
            'scheduled_days',
            'elapsed_days',
            'lapses',
            'learning_steps',
            'stability',
          ] as const) {
            if (review[field] !== 0)
              ctx.addIssue({
                code: 'custom',
                path: [...reviewPath, field],
                message: 'Unreviewed cards require zero counters',
              });
          }
        }
        if (review.reps > 0 && (review.last_reviewed_at === null || review.due_at === null)) {
          ctx.addIssue({
            code: 'custom',
            path: reviewPath,
            message: 'Reviewed cards require review timestamps',
          });
        }
        if (review.state === 'new' && review.reps !== 0) {
          ctx.addIssue({
            code: 'custom',
            path: [...reviewPath, 'state'],
            message: 'New cards cannot have repetitions',
          });
        }
        if (review.state === 'review' && review.learning_steps !== 0) {
          ctx.addIssue({
            code: 'custom',
            path: [...reviewPath, 'learning_steps'],
            message: 'Review cards cannot have learning steps',
          });
        }
        if (review.lapses > review.reps) {
          ctx.addIssue({
            code: 'custom',
            path: [...reviewPath, 'lapses'],
            message: 'Lapses cannot exceed repetitions',
          });
        }
        if (review.learning_steps > review.reps) {
          ctx.addIssue({
            code: 'custom',
            path: [...reviewPath, 'learning_steps'],
            message: 'Learning steps cannot exceed repetitions',
          });
        }
        if (review.last_reviewed_at !== null) {
          const reviewedAt = Date.parse(review.last_reviewed_at);
          if (reviewedAt < createdAt || reviewedAt > updatedAt) {
            ctx.addIssue({
              code: 'custom',
              path: [...reviewPath, 'last_reviewed_at'],
              message: 'Review timestamp is outside the state watermark',
            });
          }
          if (review.due_at !== null && Date.parse(review.due_at) < reviewedAt) {
            ctx.addIssue({
              code: 'custom',
              path: [...reviewPath, 'due_at'],
              message: 'Review due date predates the review',
            });
          }
        }
      });
    });

    if (Date.parse(state.updated_at) < createdAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['updated_at'],
        message: 'updated_at predates created_at',
      });
    }

    for (const concept of concepts) {
      const prerequisiteIds = new Set<string>();
      for (const prerequisite of concept.prerequisites) {
        if (!conceptIds.has(prerequisite) || prerequisite === concept.id) {
          ctx.addIssue({
            code: 'custom',
            path: ['domains'],
            message: 'Prerequisite target must be another concept',
          });
        }
        if (prerequisiteIds.has(prerequisite))
          ctx.addIssue({ code: 'custom', path: ['domains'], message: 'Duplicate prerequisite' });
        prerequisiteIds.add(prerequisite);
      }
      const relationKeys = new Set<string>();
      for (const relation of concept.relations) {
        if (!conceptIds.has(relation.target_id) || relation.target_id === concept.id) {
          ctx.addIssue({
            code: 'custom',
            path: ['domains'],
            message: 'Relation target must be another concept',
          });
        }
        const key = `${relation.kind}:${relation.target_id}`;
        if (relationKeys.has(key))
          ctx.addIssue({ code: 'custom', path: ['domains'], message: 'Duplicate relation' });
        relationKeys.add(key);
      }
      const calibration = concept.calibration;
      const empty =
        calibration.predicted_score === null &&
        calibration.observed_score === null &&
        calibration.updated_at === null;
      if ((calibration.samples === 0 && !empty) || (calibration.samples > 0 && empty)) {
        ctx.addIssue({
          code: 'custom',
          path: ['domains'],
          message: 'Calibration samples and measurements disagree',
        });
      }
      if (
        calibration.samples > 0 &&
        (calibration.predicted_score === null ||
          calibration.observed_score === null ||
          calibration.updated_at === null)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['domains'],
          message: 'Calibration samples require complete measurements',
        });
      }
    }

    const visiting = new Set<string>();
    const visited = new Set<string>();
    const byId = new Map(concepts.map((concept) => [concept.id, concept]));
    const visit = (id: string): void => {
      if (visiting.has(id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['domains'],
          message: 'Prerequisites contain a cycle',
        });
        return;
      }
      if (visited.has(id)) return;
      visiting.add(id);
      for (const prerequisite of byId.get(id)?.prerequisites ?? [])
        if (byId.has(prerequisite)) visit(prerequisite);
      visiting.delete(id);
      visited.add(id);
    };
    for (const concept of concepts) visit(concept.id);
  });

export type StateV2Schema = z.infer<typeof stateV2Schema>;

export type ValidationResultV2 =
  | { success: true; data: StateV2Schema }
  | { success: false; errors: z.ZodIssue[] };

export function validateStateV2(value: unknown): ValidationResultV2 {
  const result = stateV2Schema.safeParse(value);
  return result.success
    ? { success: true, data: result.data }
    : { success: false, errors: result.error.issues };
}
