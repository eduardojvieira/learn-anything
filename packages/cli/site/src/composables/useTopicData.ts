/* ================================================================== */
/*  useTopicData — Data access layer (fetch-based)                     */
/*                                                                     */
/*  Fetches data from the local API server (serve.mjs).                */
/*  All data is loaded eagerly on initTopicData() and cached in memory. */
/*  Session/exercise content is loaded on demand via fetch().          */
/*                                                                     */
/*  In dev, vite proxies /api → serve.mjs (port 24277).                */
/*  In prod, serve.mjs serves both static + API on a single port.      */
/* ================================================================== */

import { ref } from 'vue';
import type {
  StateV1,
  StateV2,
  TopicSummary,
  TopicFiles,
  TopicV2Snapshot,
  MasteryV2,
} from './topicDataTypes';
import { createSSEListener } from './useSSE';
import { clearFileContentCache, setFileContent } from './fileContentCache';

/* ------------------------------------------------------------------ */
/*  Types (re-exported for consumers)                                 */
/* ------------------------------------------------------------------ */

export type {
  ConceptStatus,
  Concept,
  Domain,
  StateV1,
  StateV2,
  ConceptV2,
  EvidenceV2,
  MasteryV2,
  TopicV2Snapshot,
  TopicSummary,
  TopicFiles,
  SelectedFilePayload,
} from './topicDataTypes';

export { loadFileContent, loadSessionContent, loadExerciseContent } from './fileContentCache';

/* ------------------------------------------------------------------ */
/*  In-memory indexes (populated by initTopicData)                     */
/* ------------------------------------------------------------------ */

let ready = false;
let initPromise: Promise<void> | null = null;
let initVersion = 0;

const stateBySlug = new Map<string, StateV1>();
const v2BySlug = new Map<string, TopicV2Snapshot>();
const knowledgeMapBySlug = new Map<string, string>();
const filesBySlug = new Map<string, TopicFiles>();

let topicSummaryCache: TopicSummary[] | null = null;

const dataVersion = ref(0);

export function getDataVersion(): number {
  return dataVersion.value;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function clearIndexes() {
  initPromise = null;
  ready = false;
  initVersion++;
  stateBySlug.clear();
  v2BySlug.clear();
  knowledgeMapBySlug.clear();
  filesBySlug.clear();
  clearFileContentCache();
  topicSummaryCache = null;
}

/* ------------------------------------------------------------------ */
/*  Test-only injection API                                            */
/* ------------------------------------------------------------------ */

export function __resetForTest(): void {
  clearIndexes();
}

export function __injectTestData(data: {
  summaries: TopicSummary[];
  states: Record<string, StateV1>;
  knowledgeMaps: Record<string, string>;
  fileContents: Record<string, string>;
  files?: Record<string, TopicFiles>;
  v2Snapshots?: Record<string, TopicV2Snapshot>;
}): void {
  topicSummaryCache = data.summaries;
  for (const [slug, state] of Object.entries(data.states)) stateBySlug.set(slug, state);
  for (const [slug, snapshot] of Object.entries(data.v2Snapshots ?? {})) {
    v2BySlug.set(slug, snapshot);
    stateBySlug.set(slug, adaptV2State(snapshot.state, snapshot.mastery));
  }
  for (const [slug, md] of Object.entries(data.knowledgeMaps)) knowledgeMapBySlug.set(slug, md);
  for (const [slug, files] of Object.entries(data.files ?? {})) filesBySlug.set(slug, files);
  for (const [path, content] of Object.entries(data.fileContents)) setFileContent(path, content);
  ready = true;
}

/* ------------------------------------------------------------------ */
/*  Build indexes from API response                                    */
/* ------------------------------------------------------------------ */

function buildIndexes(
  summaries: TopicSummary[],
  topicDataMap: Map<
    string,
    {
      state: StateV1 | StateV2;
      knowledgeMap: string;
      files?: TopicFiles;
      revision?: string;
      numbering?: Record<string, string>;
      mastery?: Record<string, MasteryV2>;
    }
  >,
) {
  topicSummaryCache = summaries;

  for (const [slug, data] of topicDataMap) {
    if (data.state.version === 2 && data.revision && data.numbering && data.mastery) {
      const snapshot: TopicV2Snapshot = {
        state: data.state,
        revision: data.revision,
        numbering: data.numbering,
        mastery: data.mastery,
      };
      v2BySlug.set(slug, snapshot);
      stateBySlug.set(slug, adaptV2State(data.state, data.mastery));
    } else if (data.state.version === 1) {
      stateBySlug.set(slug, data.state);
    }
    knowledgeMapBySlug.set(slug, data.knowledgeMap || '');
    if (data.files) filesBySlug.set(slug, data.files);
  }
}

/* ------------------------------------------------------------------ */
/*  Initialization (called once on app mount)                          */
/* ------------------------------------------------------------------ */

export async function initTopicData(): Promise<void> {
  if (ready) return;
  if (initPromise) return initPromise;

  const version = initVersion;

  initPromise = (async () => {
    const resp = await fetch('/api/topics');
    if (!resp.ok || version !== initVersion) {
      initPromise = null;
      return;
    }
    const summaries: TopicSummary[] = await resp.json();

    const topicDataMap = new Map();
    await Promise.all(
      summaries.map(async (s) => {
        const r = await fetch(`/api/topics/${encodeURIComponent(s.slug)}`);
        if (r.ok && version === initVersion) {
          topicDataMap.set(s.slug, await r.json());
        }
      }),
    );

    if (version !== initVersion) {
      initPromise = null;
      return;
    }
    buildIndexes(summaries, topicDataMap);
    ready = true;
  })();

  return initPromise;
}

/* ------------------------------------------------------------------ */
/*  SSE file change listener                                           */
/* ------------------------------------------------------------------ */

export function listenForChanges(callback: () => void): () => void {
  return createSSEListener('/api/events', () => {
    clearIndexes();
    initTopicData().then(() => {
      dataVersion.value++;
      callback();
    });
  });
}

/* ------------------------------------------------------------------ */
/*  Public API                                                        */
/* ------------------------------------------------------------------ */

export function listAllTopics(): TopicSummary[] {
  return topicSummaryCache ?? [];
}

export function loadTopic(slug: string): StateV1 | null {
  return stateBySlug.get(slug) ?? null;
}

export function loadTopicV2(slug: string): TopicV2Snapshot | null {
  return v2BySlug.get(slug) ?? null;
}

export function adaptV2State(state: StateV2, mastery: Record<string, MasteryV2>): StateV1 {
  return {
    version: 1,
    topic: state.topic,
    slug: state.slug,
    created: state.created_at,
    domains: state.domains.map((domain) => ({
      name: domain.name,
      slug: domain.slug,
      concepts: domain.concepts.map((concept) => {
        const practice = concept.evidence.filter((entry) => entry.kind === 'practice');
        const explanation = concept.evidence.filter((entry) => entry.kind === 'self_explanation');
        return {
          name: concept.name,
          slug: concept.slug,
          status: mastery[concept.id]?.status ?? 'unexplored',
          confidence: mastery[concept.id]?.score ?? 0,
          practice_count: practice.length,
          explain_count: explanation.length,
          last_practiced: latestEvidenceAt(practice),
          last_explained: latestEvidenceAt(explanation),
          details: concept.details.map((detail) => detail.name),
        };
      }),
    })),
  };
}

function latestEvidenceAt(evidence: { observed_at: string }[]): string | null {
  return evidence.reduce<string | null>(
    (latest, entry) =>
      !latest || Date.parse(entry.observed_at) > Date.parse(latest) ? entry.observed_at : latest,
    null,
  );
}

export function loadKnowledgeMap(slug: string): string | null {
  return knowledgeMapBySlug.get(slug) ?? null;
}

export function loadTopicFiles(slug: string): TopicFiles | null {
  return filesBySlug.get(slug) ?? null;
}
