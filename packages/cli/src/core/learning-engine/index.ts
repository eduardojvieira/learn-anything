import type { ConceptV2, EvidenceV2, StateV2 } from '../learn-protocol/types.js';

export { BasicScheduler, ReviewOutOfOrderError, ReviewTimestampError } from './scheduler.js';
export type { ReviewLog, ReviewResult, SpacedRepetitionScheduler } from './scheduler.js';

const DELAYED_ASSESSMENT_DELAY_MS = 2 * 86_400_000;

export type MasteryStatus = 'unexplored' | 'in_progress' | 'needs_practice' | 'mastered';
export interface Mastery {
  status: MasteryStatus;
  score: number;
  reasons: string[];
}

export interface StudyStep {
  concept_id: string;
  kind:
    | 'diagnostic'
    | 'retrieval'
    | 'self_explanation'
    | 'practice'
    | 'feedback'
    | 'correction'
    | 'interleave'
    | 'transfer'
    | 'delayed_assessment';
  reason: string;
}

/** Fixed evidence gate: post-correction non-migration evidence uses transfer/delayed weight 2, all other evidence weight 1. */
export function deriveMastery(concept: ConceptV2): Mastery {
  const evidence = concept.evidence;
  const nonMigration = evidence.filter((entry) => entry.source !== 'migration');
  const score = weightedScore(evidence);
  if (evidence.length === 0) return { status: 'unexplored', score: 0, reasons: ['no evidence'] };

  const low = nonMigration
    .filter((entry) => !entry.corrected && entry.score < 0.8)
    .sort(byObservedAt)
    .at(-1);
  const eligible = low
    ? nonMigration.filter((entry) => Date.parse(entry.observed_at) > Date.parse(low.observed_at))
    : nonMigration;
  const gateScore = weightedScore(eligible);
  const hasRecall = eligible.some((entry) =>
    ['retrieval', 'practice', 'quiz'].includes(entry.kind),
  );
  const hasTransfer = eligible.some((entry) => entry.kind === 'transfer' && entry.score >= 0.8);
  const hasDelayed = eligible.some(
    (entry) =>
      entry.kind === 'delayed_assessment' && entry.score >= 0.8 && (entry.delay_days ?? 0) >= 2,
  );
  if (eligible.length >= 3 && gateScore >= 0.8 && hasRecall && hasTransfer && hasDelayed) {
    return { status: 'mastered', score, reasons: ['evidence threshold and variety satisfied'] };
  }

  const reasons = [
    low
      ? 'needs sufficient evidence after low uncorrected feedback'
      : 'mastery evidence incomplete',
    !hasRecall ? 'needs retrieval, practice, or quiz' : '',
    !hasTransfer ? 'needs successful transfer' : '',
    !hasDelayed ? 'needs delayed assessment after two days' : '',
  ].filter(Boolean);
  return { status: score < 0.6 ? 'needs_practice' : 'in_progress', score, reasons };
}

export function deriveTopicMastery(state: StateV2): Record<string, Mastery> {
  const concepts = state.domains.flatMap((domain) => domain.concepts);
  const base = new Map(concepts.map((concept) => [concept.id, deriveMastery(concept)]));
  const byId = new Map(concepts.map((concept) => [concept.id, concept]));
  const resolved = new Map<string, Mastery>();
  const resolve = (concept: ConceptV2): Mastery => {
    const cached = resolved.get(concept.id);
    if (cached) return cached;
    const mastery = base.get(concept.id)!;
    const blocked = concept.prerequisites.some(
      (id) => byId.has(id) && resolve(byId.get(id)!).status !== 'mastered',
    );
    const result =
      mastery.status === 'mastered' && blocked
        ? {
            ...mastery,
            status: 'in_progress' as const,
            reasons: [...mastery.reasons, 'prerequisite not mastered'],
          }
        : mastery;
    resolved.set(concept.id, result);
    return result;
  };
  return Object.fromEntries(concepts.map((concept) => [concept.id, resolve(concept)]));
}

export function buildStudyPlan(state: StateV2, nowIso: string): StudyStep[] {
  const now = Date.parse(nowIso);
  const mastery = deriveTopicMastery(state);
  const byId = new Map(
    state.domains.flatMap((domain) => domain.concepts).map((concept) => [concept.id, concept]),
  );
  const depthCache = new Map<string, number>();
  const depth = (concept: ConceptV2): number => {
    const cached = depthCache.get(concept.id);
    if (cached !== undefined) return cached;
    const result = Math.max(
      0,
      ...concept.prerequisites.map((id) => (byId.has(id) ? depth(byId.get(id)!) + 1 : 0)),
    );
    depthCache.set(concept.id, result);
    return result;
  };
  const maxDepth = Math.max(0, ...[...byId.values()].map(depth));
  const ordered: ConceptV2[] = [];
  for (let level = 0; level <= maxDepth; level += 1) {
    const domains = state.domains.map((domain) =>
      domain.concepts
        .filter((concept) => depth(concept) === level)
        .sort((a, b) => mastery[a.id].score - mastery[b.id].score),
    );
    for (let index = 0; domains.some((domain) => domain[index]); index += 1) {
      for (const domain of domains) if (domain[index]) ordered.push(domain[index]);
    }
  }
  const plan: StudyStep[] = [];
  const interleaveable: ConceptV2[] = [];
  for (const concept of ordered) {
    const evidence = concept.evidence.filter((entry) => entry.source !== 'migration');
    if (evidence.length === 0) {
      plan.push(step(concept, 'diagnostic', 'establish a baseline'));
      interleaveable.push(concept);
      continue;
    }
    const latest = [...evidence].sort(byObservedAt).at(-1)!;
    if (latest.score < 0.8) {
      plan.push(step(concept, 'feedback', 'review the latest weak evidence'));
      plan.push(step(concept, 'correction', 'correct the identified gap'));
    }
    if (concept.review.due_at !== null && Date.parse(concept.review.due_at) > now) continue;
    interleaveable.push(concept);
    plan.push(step(concept, 'retrieval', 'recall without notes'));
    plan.push(step(concept, 'self_explanation', 'explain the mechanism'));
    plan.push(step(concept, 'practice', 'apply the concept'));
    plan.push(step(concept, 'transfer', 'use it in a new context'));
    if (now - Date.parse(latest.observed_at) >= DELAYED_ASSESSMENT_DELAY_MS) {
      plan.push(step(concept, 'delayed_assessment', 'verify retention after two days'));
    }
  }
  if (interleaveable.length > 1) {
    for (const concept of interleaveable)
      plan.push(step(concept, 'interleave', 'alternate domains and concepts'));
  }
  return plan;
}

function step(concept: ConceptV2, kind: StudyStep['kind'], reason: string): StudyStep {
  return { concept_id: concept.id, kind, reason };
}

function weightedScore(evidence: EvidenceV2[]): number {
  if (evidence.length === 0) return 0;
  const total = evidence.reduce(
    (sum, entry) =>
      sum + (entry.kind === 'transfer' || entry.kind === 'delayed_assessment' ? 2 : 1),
    0,
  );
  return (
    evidence.reduce(
      (sum, entry) =>
        sum +
        entry.score * (entry.kind === 'transfer' || entry.kind === 'delayed_assessment' ? 2 : 1),
      0,
    ) / total
  );
}

function byObservedAt(a: EvidenceV2, b: EvidenceV2): number {
  return Date.parse(a.observed_at) - Date.parse(b.observed_at);
}
