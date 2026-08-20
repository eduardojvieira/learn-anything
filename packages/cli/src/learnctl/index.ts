import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  BasicScheduler,
  buildStudyPlan,
  deriveTopicMastery,
  ReviewOutOfOrderError,
} from '../core/learning-engine/index.js';
import {
  deriveNumbering,
  generateSlug,
  learningSessionV1Schema,
  migrateV1ToV2,
  renderSessionMarkdown,
  stateV2Schema,
} from '../core/learn-protocol/index.js';
import type { LearningSessionV1, SessionLocale } from '../core/learn-protocol/session.js';
import type { ReviewRating, StateV2 } from '../core/learn-protocol/types.js';
import {
  StateAlreadyExistsError,
  StateConflictError,
  StateCorruptionError,
  StateLockTimeoutError,
  StateRecoveryError,
  StateStore,
} from '../core/state-store/index.js';
import { learnConfigStore, type LearnConfig } from '../core/learn-config.js';

const payloadSchema = z
  .object({
    topic: z.string().min(1),
    slug: z.string().min(1).optional(),
    created_at: z.iso.datetime({ offset: true }),
    domains: z.array(
      z
        .object({
          name: z.string().min(1),
          slug: z.string().min(1).optional(),
          concepts: z.array(
            z
              .object({
                name: z.string().min(1),
                slug: z.string().min(1).optional(),
                details: z.array(z.string().min(1)),
                prerequisites: z.array(z.string().min(1)).optional(),
                relations: z
                  .array(
                    z
                      .object({
                        kind: z.enum(['related', 'contrast', 'analogy', 'application']),
                        target: z.string().min(1),
                      })
                      .strict(),
                  )
                  .optional(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();

type CreateTopicPayload = z.infer<typeof payloadSchema>;

const recordEvidenceSchema = z
  .object({
    expected_revision: z.string().min(1),
    idempotency_key: z.string().min(1).max(200),
    concept_id: z.uuid(),
    kind: z.enum([
      'diagnostic',
      'retrieval',
      'self_explanation',
      'practice',
      'quiz',
      'transfer',
      'delayed_assessment',
    ]),
    observed_at: z.iso.datetime({ offset: true }),
    score: z.number().min(0).max(1),
    session_id: z.uuid().nullable().optional(),
    feedback: z.string().min(1).optional(),
    corrected: z.boolean().optional(),
    predicted_score: z.number().min(0).max(1).optional(),
  })
  .strict();
type RecordEvidencePayload = z.infer<typeof recordEvidenceSchema>;
const recordAssessmentSchema = recordEvidenceSchema.extend({
  rating: z.enum(['again', 'hard', 'good', 'easy']),
});
type EvidenceRequest = RecordEvidencePayload & { rating?: ReviewRating };

const sessionBlockKind = z.enum([
  'positioning',
  'diagnostic',
  'retrieval',
  'explanation',
  'worked_example',
  'self_explanation',
  'feedback',
  'correction',
  'interleaving',
  'transfer',
  'delayed_assessment',
  'summary',
]);
const recordSessionSchema = z
  .object({
    expected_topic_revision: z.string().regex(/^[a-f0-9]{64}$/),
    idempotency_key: z.string().min(1).max(200),
    concept_id: z.uuid(),
    kind: z.enum(['study', 'explain', 'practice', 'review', 'quiz']),
    locale: z.enum(['en', 'es', 'zh-CN']),
    created_at: z.iso.datetime({ offset: true }),
    blocks: z.array(z.object({ kind: sessionBlockKind, text: z.string().min(1) }).strict()).min(1),
    socratic_prompts: z.array(z.string().min(1)).min(1),
  })
  .strict();
type RecordSessionPayload = z.infer<typeof recordSessionSchema>;

const updateSocraticResponseSchema = z
  .object({
    expected_revision: z.string().regex(/^[a-f0-9]{64}$/),
    idempotency_key: z.string().min(1).max(200),
    question_id: z.uuid(),
    response: z.string(),
    submitted_at: z.iso.datetime({ offset: true }),
  })
  .strict();
type UpdateSocraticResponsePayload = z.infer<typeof updateSocraticResponseSchema>;

export class LearnctlPayloadError extends Error {
  constructor() {
    super('Invalid learnctl payload');
    this.name = 'LearnctlPayloadError';
  }
}

export class UsageError extends Error {
  constructor() {
    super(
      'Usage: learnctl <init-topic|snapshot|migrate|render|record-evidence|record-assessment|study|record-session|session-snapshot|update-socratic-response|render-session> ...',
    );
    this.name = 'UsageError';
  }
}

export class IdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency key was already used with a different request');
    this.name = 'IdempotencyConflictError';
  }
}

export class UnknownConceptError extends Error {
  constructor() {
    super('Concept does not exist in this topic');
    this.name = 'UnknownConceptError';
  }
}

export class UnknownSessionError extends Error {
  constructor() {
    super('Session does not exist in this topic');
    this.name = 'UnknownSessionError';
  }
}

export class UnknownQuestionError extends Error {
  constructor() {
    super('Socratic prompt does not exist in this session');
    this.name = 'UnknownQuestionError';
  }
}

export class SessionTimestampError extends Error {
  constructor() {
    super('Session timestamp is out of order');
    this.name = 'SessionTimestampError';
  }
}

export class SessionTopicMismatchError extends Error {
  constructor() {
    super('Session does not belong to this topic and concept');
    this.name = 'SessionTopicMismatchError';
  }
}

export interface TopicSnapshot {
  state: StateV2;
  revision: string;
  numbering: Record<string, string>;
  mastery: ReturnType<typeof deriveTopicMastery>;
  config: LearnConfig | null;
}

export async function createTopic(topicDir: string, payload: unknown) {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) throw new LearnctlPayloadError();
  const state = createState(parsed.data);
  return v2Store(topicDir).initialize(state);
}

export async function snapshot(topicDir: string): Promise<TopicSnapshot> {
  const current = await v2Store(topicDir).read();
  return {
    ...current,
    numbering: deriveNumbering(current.state),
    mastery: deriveTopicMastery(current.state),
    config: await canonicalTopicConfig(topicDir),
  };
}

export async function migrate(topicDir: string) {
  return migrateV1ToV2(topicDir);
}

export async function recordEvidence(topicDir: string, payload: unknown) {
  const parsed = recordEvidenceSchema.safeParse(payload);
  if (!parsed.success) throw new LearnctlPayloadError();
  return recordRequest(topicDir, parsed.data);
}

export async function recordAssessment(topicDir: string, payload: unknown) {
  const parsed = recordAssessmentSchema.safeParse(payload);
  if (!parsed.success) throw new LearnctlPayloadError();
  return recordRequest(topicDir, parsed.data);
}

export async function recordSession(topicDir: string, payload: unknown) {
  const parsed = recordSessionSchema.safeParse(payload);
  if (!parsed.success) throw new LearnctlPayloadError();
  const request = parsed.data;
  const topic = await snapshot(topicDir);
  const id = deterministicId(topic.state.id, `session:${request.idempotency_key}`);
  const store = sessionStore(sessionDirectory(topicDir, id));

  if (await fileExists(sessionPath(topicDir, id))) {
    const current = await store.read();
    assertSessionBinding(current.state, id, topic.state);
    assertSameSession(current.state, request);
    return { session: current.state, revision: current.revision };
  }
  if (topic.revision !== request.expected_topic_revision)
    throw new StateConflictError(request.expected_topic_revision, topic.revision);
  const concept = findConcept(topic.state, request.concept_id);
  if (!concept) throw new UnknownConceptError();
  if (Date.parse(request.created_at) < Date.parse(topic.state.created_at))
    throw new SessionTimestampError();
  const session: LearningSessionV1 = {
    version: 1,
    id,
    topic_id: topic.state.id,
    topic_revision: topic.revision,
    topic_name: topic.state.topic,
    concept_id: concept.id,
    concept_name: concept.name,
    kind: request.kind,
    locale: request.locale,
    created_at: request.created_at,
    updated_at: request.created_at,
    blocks: request.blocks.map((block, index) => ({
      id: deterministicId(id, `block:${index}`),
      ...block,
    })),
    socratic_prompts: request.socratic_prompts.map((prompt, index) => ({
      id: deterministicId(id, `prompt:${index}`),
      prompt,
      responses: [],
    })),
  };
  try {
    const created = await store.initialize(session);
    return { session: created.state, revision: created.revision };
  } catch (error) {
    if (!(error instanceof StateAlreadyExistsError)) throw error;
    const current = await store.read();
    assertSessionBinding(current.state, id, topic.state);
    assertSameSession(current.state, request);
    return { session: current.state, revision: current.revision };
  }
}

export async function sessionSnapshot(topicDir: string, sessionId: string) {
  if (!z.uuid().safeParse(sessionId).success) throw new LearnctlPayloadError();
  const store = sessionStore(sessionDirectory(topicDir, sessionId));
  if (!(await fileExists(sessionPath(topicDir, sessionId)))) throw new UnknownSessionError();
  const current = await store.read();
  assertSessionBinding(current.state, sessionId, (await snapshot(topicDir)).state);
  return { session: current.state, revision: current.revision };
}

export async function listSessions(topicDir: string) {
  await snapshot(topicDir);
  const sessionsDir = path.join(topicDir, 'sessions');
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(sessionsDir, { withFileTypes: true });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    )
      return [];
    throw error;
  }
  const sessions = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !z.uuid().safeParse(entry.name).success) continue;
    const current = await sessionSnapshot(topicDir, entry.name);
    sessions.push({
      id: current.session.id,
      concept_id: current.session.concept_id,
      concept_name: current.session.concept_name,
      kind: current.session.kind,
      locale: current.session.locale,
      created_at: current.session.created_at,
      updated_at: current.session.updated_at,
      revision: current.revision,
    });
  }
  // Keep a deterministic ledger even when filesystem enumeration differs.
  return sessions.sort(
    (left, right) =>
      left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id),
  );
}

export async function updateSocraticResponse(
  topicDir: string,
  sessionId: string,
  payload: unknown,
) {
  if (!z.uuid().safeParse(sessionId).success) throw new LearnctlPayloadError();
  const parsed = updateSocraticResponseSchema.safeParse(payload);
  if (!parsed.success) throw new LearnctlPayloadError();
  const request = parsed.data;
  const store = sessionStore(sessionDirectory(topicDir, sessionId));
  if (!(await fileExists(sessionPath(topicDir, sessionId)))) throw new UnknownSessionError();
  const current = await store.read();
  assertSessionBinding(current.state, sessionId, (await snapshot(topicDir)).state);
  const id = deterministicId(sessionId, `response:${request.idempotency_key}`);
  const existing = findSessionResponse(current.state, id);
  if (existing) {
    assertSameResponse(existing, request);
    return { session: current.state, revision: current.revision };
  }
  if (Date.parse(request.submitted_at) < Date.parse(current.state.updated_at))
    throw new SessionTimestampError();
  if (!current.state.socratic_prompts.some((prompt) => prompt.id === request.question_id))
    throw new UnknownQuestionError();
  try {
    const next = await store.transact(request.expected_revision, (session) =>
      appendResponse(session, id, request),
    );
    return { session: next.state, revision: next.revision };
  } catch (error) {
    if (!(error instanceof StateConflictError)) throw error;
    const reread = await store.read();
    assertSessionBinding(reread.state, sessionId, (await snapshot(topicDir)).state);
    const response = findSessionResponse(reread.state, id);
    if (response) {
      assertSameResponse(response, request);
      return { session: reread.state, revision: reread.revision };
    }
    throw error;
  }
}

export async function renderSession(
  topicDir: string,
  sessionId: string,
  locale?: string,
): Promise<{ revision: string; path: string }> {
  const current = await sessionSnapshot(topicDir, sessionId);
  const selectedLocale = locale ?? (await configuredLocale(topicDir)) ?? current.session.locale;
  if (!z.enum(['en', 'es', 'zh-CN']).safeParse(selectedLocale).success)
    throw new LearnctlPayloadError();
  const outputDirectory = path.join(sessionDirectory(topicDir, sessionId), 'views');
  const outputPath = path.join(outputDirectory, `${selectedLocale}.md`);
  await fs.mkdir(outputDirectory, { recursive: true });
  await durableReplace(
    outputDirectory,
    outputPath,
    path.join(outputDirectory, `.${selectedLocale}.md.tmp`),
    Buffer.from(renderSessionMarkdown(current.session, selectedLocale as SessionLocale)),
  );
  return { revision: current.revision, path: outputPath };
}

async function configuredLocale(topicDir: string): Promise<SessionLocale | undefined> {
  return (await canonicalTopicConfig(topicDir))?.locale;
}

/** Reads only the shared config for the canonical .learn/topics/<slug> layout. */
async function canonicalTopicConfig(topicDir: string): Promise<LearnConfig | null> {
  const resolvedTopic = path.resolve(topicDir);
  const topicsDir = path.dirname(resolvedTopic);
  if (
    path.basename(topicsDir) !== 'topics' ||
    path.basename(path.dirname(topicsDir)) !== '.learn' ||
    path.dirname(resolvedTopic) !== path.resolve(topicsDir)
  )
    return null;
  const learnDir = path.dirname(topicsDir);
  try {
    await fs.access(path.join(learnDir, 'config.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return (await learnConfigStore(learnDir).read()).state;
}

async function recordRequest(topicDir: string, request: EvidenceRequest) {
  if ((request.score < 0.8 && !request.feedback) || (request.corrected && !request.feedback))
    throw new LearnctlPayloadError();
  const store = v2Store(topicDir);
  const current = await store.read();
  if (request.session_id)
    await assertEvidenceSession(
      topicDir,
      current.state,
      request.session_id,
      request.concept_id,
      request.observed_at,
    );
  const existing = findIdempotent(current.state, request);
  if (existing) return evidenceResult(current.state, current.revision);
  try {
    const next = await store.transact(request.expected_revision, (state) =>
      appendEvidence(state, request),
    );
    return evidenceResult(next.state, next.revision);
  } catch (error) {
    if (!(error instanceof StateConflictError)) throw error;
    const reread = await store.read();
    if (findIdempotent(reread.state, request)) return evidenceResult(reread.state, reread.revision);
    throw error;
  }
}

export async function study(topicDir: string, nowIso: string) {
  if (!z.iso.datetime({ offset: true }).safeParse(nowIso).success) throw new LearnctlPayloadError();
  return buildStudyPlan((await snapshot(topicDir)).state, nowIso);
}

export async function render(topicDir: string): Promise<{ revision: string; path: string }> {
  const current = await snapshot(topicDir);
  const outputPath = path.join(topicDir, 'knowledge-map.md');
  const tempPath = path.join(topicDir, '.knowledge-map.md.tmp');
  const lines = [`# ${current.state.topic}`, ''];
  for (const domain of current.state.domains) {
    lines.push(`## ${current.numbering[domain.id]} ${domain.name}`);
    for (const concept of domain.concepts) {
      lines.push(`- ${current.numbering[concept.id]} ${concept.name}`);
      for (const detail of concept.details) {
        lines.push(`  - ${current.numbering[detail.id]} ${detail.name}`);
      }
    }
  }
  await durableReplace(topicDir, outputPath, tempPath, Buffer.from(`${lines.join('\n')}\n`));
  return { revision: current.revision, path: outputPath };
}

export interface LearnctlIo {
  stdout: { write(value: string): unknown };
  stderr: { write(value: string): unknown };
}

export async function main(
  args: string[] = process.argv.slice(2),
  io: LearnctlIo = process,
): Promise<number> {
  try {
    const result = await dispatch(args);
    io.stdout.write(`${JSON.stringify(result)}\n`);
    return 0;
  } catch (error) {
    io.stderr.write(
      `${JSON.stringify({ error: errorName(error), message: errorMessage(error) })}\n`,
    );
    return exitCode(error);
  }
}

async function dispatch(args: string[]): Promise<unknown> {
  const [command, topicDir, extra, ...rest] = args;
  if (command === 'init-topic' && topicDir && extra && rest.length === 0) {
    let payload: unknown;
    try {
      payload = JSON.parse(await fs.readFile(extra, 'utf8'));
    } catch {
      throw new LearnctlPayloadError();
    }
    return createTopic(topicDir, payload);
  }
  if (command === 'snapshot' && topicDir && !extra) return snapshot(topicDir);
  if (command === 'migrate' && topicDir && !extra) return migrate(topicDir);
  if (command === 'render' && topicDir && !extra) return render(topicDir);
  if (command === 'record-evidence' && topicDir && extra && rest.length === 0) {
    let payload: unknown;
    try {
      payload = JSON.parse(await fs.readFile(extra, 'utf8'));
    } catch {
      throw new LearnctlPayloadError();
    }
    return recordEvidence(topicDir, payload);
  }
  if (command === 'record-assessment' && topicDir && extra && rest.length === 0) {
    let payload: unknown;
    try {
      payload = JSON.parse(await fs.readFile(extra, 'utf8'));
    } catch {
      throw new LearnctlPayloadError();
    }
    return recordAssessment(topicDir, payload);
  }
  if (command === 'record-session' && topicDir && extra && rest.length === 0) {
    let payload: unknown;
    try {
      payload = JSON.parse(await fs.readFile(extra, 'utf8'));
    } catch {
      throw new LearnctlPayloadError();
    }
    return recordSession(topicDir, payload);
  }
  if (command === 'session-snapshot' && topicDir && extra && rest.length === 0)
    return sessionSnapshot(topicDir, extra);
  if (command === 'update-socratic-response' && topicDir && extra && rest.length === 1) {
    let payload: unknown;
    try {
      payload = JSON.parse(await fs.readFile(rest[0], 'utf8'));
    } catch {
      throw new LearnctlPayloadError();
    }
    return updateSocraticResponse(topicDir, extra, payload);
  }
  if (command === 'render-session' && topicDir && extra && rest.length <= 1)
    return renderSession(topicDir, extra, rest[0]);
  if (command === 'study' && topicDir && extra && rest.length === 0) return study(topicDir, extra);
  throw new UsageError();
}

function createState(payload: CreateTopicPayload): StateV2 {
  const state: StateV2 = {
    version: 2,
    id: randomUUID(),
    topic: payload.topic,
    slug: payload.slug ?? generateSlug(payload.topic),
    created_at: payload.created_at,
    updated_at: payload.created_at,
    domains: payload.domains.map((domain) => ({
      id: randomUUID(),
      name: domain.name,
      slug: domain.slug ?? generateSlug(domain.name),
      concepts: domain.concepts.map((concept) => ({
        id: randomUUID(),
        name: concept.name,
        slug: concept.slug ?? generateSlug(concept.name),
        details: concept.details.map((detail) => ({
          id: randomUUID(),
          name: detail,
          slug: generateSlug(detail),
        })),
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
      })),
    })),
  };
  const concepts = state.domains.flatMap((domain) => domain.concepts);
  const inputs = payload.domains.flatMap((domain) => domain.concepts);
  const idsBySlug = new Map<string, string | null>();
  for (const concept of concepts)
    idsBySlug.set(concept.slug, idsBySlug.has(concept.slug) ? null : concept.id);
  for (const [input, concept] of inputs.map((input, index) => [input, concepts[index]] as const)) {
    concept.prerequisites = (input.prerequisites ?? []).map((slug) =>
      resolveConceptId(idsBySlug, slug),
    );
    concept.relations = (input.relations ?? []).map((relation) => ({
      kind: relation.kind,
      target_id: resolveConceptId(idsBySlug, relation.target),
    }));
  }
  if (!stateV2Schema.safeParse(state).success) throw new LearnctlPayloadError();
  return state;
}

function resolveConceptId(idsBySlug: Map<string, string | null>, slug: string): string {
  const id = idsBySlug.get(slug);
  if (!id) throw new LearnctlPayloadError();
  return id;
}

function v2Store(topicDir: string): StateStore<StateV2> {
  return new StateStore<StateV2>(topicDir, {
    validate: (state) => {
      const result = stateV2Schema.safeParse(state);
      if (!result.success) throw result.error;
    },
  });
}

function appendEvidence(state: StateV2, payload: EvidenceRequest): StateV2 {
  const concept = state.domains
    .flatMap((domain) => domain.concepts)
    .find((entry) => entry.id === payload.concept_id);
  if (!concept) throw new UnknownConceptError();
  const id = deterministicEvidenceId(state.id, payload.idempotency_key);
  const existing = concept.evidence.find((entry) => entry.id === id);
  if (existing) {
    assertSameEvidence(existing, payload);
    return state;
  }
  const previous = concept.evidence
    .filter((entry) => entry.source !== 'migration')
    .sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at))[0];
  const delayDays =
    payload.kind === 'delayed_assessment' && previous
      ? Math.max(
          0,
          Math.floor(
            (Date.parse(payload.observed_at) - Date.parse(previous.observed_at)) / 86_400_000,
          ),
        )
      : payload.kind === 'delayed_assessment'
        ? 0
        : null;
  concept.evidence.push({
    id,
    kind: payload.kind,
    observed_at: payload.observed_at,
    score: payload.score,
    source: 'learnctl',
    predicted_score: payload.predicted_score ?? null,
    review_rating: payload.rating ?? null,
    session_id: payload.session_id ?? null,
    feedback: payload.feedback ?? null,
    corrected: payload.corrected ?? false,
    delay_days: delayDays,
  });
  if (payload.rating !== undefined)
    concept.review = new BasicScheduler().review(
      concept.review,
      payload.observed_at,
      payload.rating,
    ).card;
  if (payload.predicted_score !== undefined) {
    const samples = concept.calibration.samples + 1;
    const predicted =
      ((concept.calibration.predicted_score ?? 0) * concept.calibration.samples +
        payload.predicted_score) /
      samples;
    const observed =
      ((concept.calibration.observed_score ?? 0) * concept.calibration.samples + payload.score) /
      samples;
    concept.calibration = {
      predicted_score: predicted,
      observed_score: observed,
      samples,
      updated_at: maxIso(concept.calibration.updated_at, payload.observed_at),
    };
  }
  return { ...state, updated_at: maxIso(state.updated_at, payload.observed_at) };
}

function findIdempotent(state: StateV2, payload: EvidenceRequest): boolean {
  const id = deterministicEvidenceId(state.id, payload.idempotency_key);
  const found = state.domains
    .flatMap((domain) => domain.concepts)
    .find((concept) => concept.evidence.some((entry) => entry.id === id));
  if (!found) return false;
  if (found.id !== payload.concept_id) throw new IdempotencyConflictError();
  assertSameEvidence(found.evidence.find((entry) => entry.id === id)!, payload);
  return true;
}

function assertSameEvidence(
  existing: StateV2['domains'][number]['concepts'][number]['evidence'][number],
  payload: EvidenceRequest,
): void {
  if (
    existing.kind !== payload.kind ||
    existing.observed_at !== payload.observed_at ||
    existing.score !== payload.score ||
    existing.predicted_score !== (payload.predicted_score ?? null) ||
    existing.review_rating !== (payload.rating ?? null) ||
    existing.session_id !== (payload.session_id ?? null) ||
    existing.feedback !== (payload.feedback ?? null) ||
    existing.corrected !== (payload.corrected ?? false)
  ) {
    throw new IdempotencyConflictError();
  }
}

function deterministicEvidenceId(topicId: string, key: string): string {
  return deterministicId(topicId, `evidence:${key}`);
}

function deterministicId(namespace: string, key: string): string {
  const bytes = createHash('sha256').update(`${namespace}\0${key}`).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x80;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function findConcept(state: StateV2, conceptId: string) {
  return state.domains
    .flatMap((domain) => domain.concepts)
    .find((concept) => concept.id === conceptId);
}

function assertSessionBinding(session: LearningSessionV1, sessionId: string, topic: StateV2): void {
  if (
    session.id !== sessionId ||
    session.topic_id !== topic.id ||
    !findConcept(topic, session.concept_id)
  )
    throw new SessionTopicMismatchError();
  if (Date.parse(session.created_at) < Date.parse(topic.created_at))
    throw new SessionTimestampError();
}

function sessionDirectory(topicDir: string, sessionId: string): string {
  return path.join(topicDir, 'sessions', sessionId);
}

function sessionPath(topicDir: string, sessionId: string): string {
  return path.join(sessionDirectory(topicDir, sessionId), 'session.json');
}

function sessionStore(sessionDir: string): StateStore<LearningSessionV1> {
  return new StateStore<LearningSessionV1>(sessionDir, {
    fileName: 'session.json',
    validate: (state) => {
      const result = learningSessionV1Schema.safeParse(state);
      if (!result.success) throw result.error;
    },
  });
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    )
      return false;
    throw error;
  }
}

function assertSameSession(session: LearningSessionV1, request: RecordSessionPayload): void {
  if (
    session.concept_id !== request.concept_id ||
    session.kind !== request.kind ||
    session.locale !== request.locale ||
    session.created_at !== request.created_at ||
    session.blocks.length !== request.blocks.length ||
    session.socratic_prompts.length !== request.socratic_prompts.length ||
    session.blocks.some(
      (block, index) =>
        block.kind !== request.blocks[index]?.kind || block.text !== request.blocks[index]?.text,
    ) ||
    session.socratic_prompts.some(
      (prompt, index) => prompt.prompt !== request.socratic_prompts[index],
    )
  ) {
    throw new IdempotencyConflictError();
  }
}

function findSessionResponse(session: LearningSessionV1, responseId: string) {
  for (const prompt of session.socratic_prompts) {
    const response = prompt.responses.find((entry) => entry.id === responseId);
    if (response) return { prompt, response };
  }
  return undefined;
}

function assertSameResponse(
  existing: NonNullable<ReturnType<typeof findSessionResponse>>,
  request: UpdateSocraticResponsePayload,
): void {
  if (
    existing.prompt.id !== request.question_id ||
    existing.response.response !== request.response ||
    existing.response.submitted_at !== request.submitted_at
  )
    throw new IdempotencyConflictError();
}

function appendResponse(
  session: LearningSessionV1,
  id: string,
  request: UpdateSocraticResponsePayload,
): LearningSessionV1 {
  const prompt = session.socratic_prompts.find((entry) => entry.id === request.question_id);
  if (!prompt) throw new UnknownQuestionError();
  if (Date.parse(request.submitted_at) < Date.parse(session.updated_at))
    throw new SessionTimestampError();
  return {
    ...session,
    updated_at: request.submitted_at,
    socratic_prompts: session.socratic_prompts.map((entry) =>
      entry.id === prompt.id
        ? {
            ...entry,
            responses: [
              ...entry.responses,
              { id, response: request.response, submitted_at: request.submitted_at },
            ],
          }
        : entry,
    ),
  };
}

async function assertEvidenceSession(
  topicDir: string,
  state: StateV2,
  sessionId: string,
  conceptId: string,
  observedAt: string,
): Promise<void> {
  const current = await sessionSnapshot(topicDir, sessionId);
  if (current.session.topic_id !== state.id || current.session.concept_id !== conceptId)
    throw new SessionTopicMismatchError();
  if (Date.parse(observedAt) < Date.parse(current.session.created_at))
    throw new SessionTimestampError();
}

function maxIso(first: string | null, second: string): string {
  return first === null || Date.parse(second) > Date.parse(first) ? second : first;
}

function evidenceResult(state: StateV2, revision: string) {
  return { state, revision, mastery: deriveTopicMastery(state) };
}

async function durableReplace(
  topicDir: string,
  targetPath: string,
  tempPath: string,
  bytes: Buffer,
): Promise<void> {
  const uniqueTempPath = `${tempPath}-${randomUUID()}`;
  try {
    const handle = await fs.open(uniqueTempPath, 'w', 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(uniqueTempPath, targetPath);
    await syncDirectory(topicDir);
  } finally {
    await fs.rm(uniqueTempPath, { force: true });
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  try {
    const directory = await fs.open(directoryPath, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null
        ? (error as NodeJS.ErrnoException).code
        : undefined;
    if (!['EINVAL', 'EPERM', 'ENOTSUP', 'EISDIR'].includes(code ?? '')) throw error;
  }
}

function exitCode(error: unknown): number {
  if (error instanceof UsageError) return 2;
  if (
    error instanceof StateAlreadyExistsError ||
    error instanceof StateConflictError ||
    error instanceof StateLockTimeoutError ||
    error instanceof IdempotencyConflictError ||
    error instanceof UnknownConceptError ||
    error instanceof UnknownSessionError ||
    error instanceof UnknownQuestionError ||
    error instanceof SessionTimestampError ||
    error instanceof SessionTopicMismatchError ||
    error instanceof ReviewOutOfOrderError
  )
    return 3;
  if (
    error instanceof LearnctlPayloadError ||
    error instanceof StateCorruptionError ||
    error instanceof StateRecoveryError
  )
    return 4;
  return 1;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'Error';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
