import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adaptV2State,
  __injectTestData,
  __resetForTest,
  loadTopic,
  loadTopicV2,
  type StateV2,
  type TopicV2Snapshot,
} from '@/composables/useTopicData';
import {
  createIdempotencyKey,
  createSessionStore,
  formatSessionDate,
} from '@/composables/useSessions';
import { computeV2ReviewPriority } from '@/components/review/useReview';
import type { TopicSummary } from '@/composables/topicDataTypes';

const ids = {
  topic: '00000000-0000-4000-8000-000000000001',
  domain: '00000000-0000-4000-8000-000000000002',
  concept: '00000000-0000-4000-8000-000000000003',
  evidence: '00000000-0000-4000-8000-000000000004',
  session: '00000000-0000-4000-8000-000000000005',
  block: '00000000-0000-4000-8000-000000000006',
  prompt: '00000000-0000-4000-8000-000000000007',
};
const revision = 'a'.repeat(64);

function v2State(dueAt: string | null = '2026-01-01T00:00:00.000Z'): StateV2 {
  return {
    version: 2,
    id: ids.topic,
    topic: 'V2 topic',
    slug: 'v2-topic',
    created_at: '2025-12-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    domains: [
      {
        id: ids.domain,
        name: 'Domain',
        slug: 'domain',
        concepts: [
          {
            id: ids.concept,
            name: 'Concept',
            slug: 'concept',
            details: [{ id: ids.block, name: 'Detail', slug: 'detail' }],
            prerequisites: [],
            relations: [],
            evidence: [
              {
                id: ids.evidence,
                kind: 'practice',
                observed_at: '2025-12-31T00:00:00.000Z',
                score: 0.9,
                source: 'learnctl',
                predicted_score: null,
                review_rating: null,
                session_id: null,
                feedback: null,
                corrected: false,
                delay_days: null,
              },
              {
                id: '00000000-0000-4000-8000-000000000008',
                kind: 'self_explanation',
                observed_at: '2026-01-01T00:00:00.000Z',
                score: 0.8,
                source: 'learnctl',
                predicted_score: null,
                review_rating: null,
                session_id: null,
                feedback: null,
                corrected: false,
                delay_days: null,
              },
              {
                id: '00000000-0000-4000-8000-000000000009',
                kind: 'transfer',
                observed_at: '2026-01-01T01:00:00.000Z',
                score: 1,
                source: 'learnctl',
                predicted_score: null,
                review_rating: null,
                session_id: null,
                feedback: null,
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
            review: {
              state: 'review',
              due_at: dueAt,
              last_reviewed_at: null,
              stability: 1,
              difficulty: 5,
              scheduled_days: 1,
              elapsed_days: 1,
              reps: 2,
              lapses: 1,
              learning_steps: 0,
            },
          },
        ],
      },
    ],
  };
}

const topic: TopicSummary = {
  slug: 'v2-topic',
  name: 'V2 topic',
  domainCount: 1,
  totalConcepts: 1,
  masteredCount: 0,
  percentage: 0,
};

function snapshot(): TopicV2Snapshot {
  return {
    state: v2State(),
    revision,
    numbering: { [ids.domain]: '1', [ids.concept]: '1.1' },
    mastery: { [ids.concept]: { status: 'in_progress', score: 0.73, reasons: [] } },
  };
}

function session(updatedAt = '2026-01-02T00:00:00.000Z') {
  return {
    version: 1 as const,
    id: ids.session,
    topic_id: ids.topic,
    topic_revision: revision,
    topic_name: 'V2 topic',
    concept_id: ids.concept,
    concept_name: 'Concept',
    kind: 'study' as const,
    locale: 'en' as const,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: updatedAt,
    blocks: [{ id: ids.block, kind: 'retrieval' as const, text: 'Recall it.' }],
    socratic_prompts: [
      {
        id: ids.prompt,
        prompt: 'Why?',
        responses: [{ id: ids.evidence, response: 'Earlier answer', submitted_at: updatedAt }],
      },
    ],
  };
}

function twoPromptSession(updatedAt = '2026-01-02T00:00:00.000Z') {
  const value = session(updatedAt);
  return {
    ...value,
    socratic_prompts: [
      ...value.socratic_prompts,
      { id: '00000000-0000-4000-8000-000000000010', prompt: 'And then?', responses: [] },
    ],
  };
}

afterEach(() => {
  __resetForTest();
  vi.unstubAllGlobals();
});

describe('V2 display adapter', () => {
  it('accepts Spanish session locales and formats with canonical timezone', () => {
    const locale = 'es' as const;
    const iso = '2026-01-01T00:00:00.000Z';
    expect(locale).toBe('es');
    expect(formatSessionDate(iso, locale, 'America/Argentina/Buenos_Aires')).toBe(
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'America/Argentina/Buenos_Aires',
      }).format(new Date(iso)),
    );
  });
  it('keeps V1 inputs intact and derives V2 display values only from mastery and matching evidence', () => {
    const state = v2State();
    const adapted = adaptV2State(state, {
      [ids.concept]: { status: 'needs_practice', score: 0.42, reasons: [] },
    });
    expect(adapted.version).toBe(1);
    expect(adapted.domains[0].concepts[0]).toMatchObject({
      status: 'needs_practice',
      confidence: 0.42,
      practice_count: 1,
      explain_count: 1,
      last_practiced: '2025-12-31T00:00:00.000Z',
      last_explained: '2026-01-01T00:00:00.000Z',
      details: ['Detail'],
    });
    expect(adapted.domains[0].concepts[0].practice_count).not.toBe(2);

    state.domains[0].concepts[0].evidence.push({
      id: '00000000-0000-4000-8000-000000000011',
      kind: 'practice',
      observed_at: '2025-12-31T01:00:00+03:00',
      score: 1,
      source: 'learnctl',
      predicted_score: null,
      review_rating: null,
      session_id: null,
      feedback: null,
      corrected: false,
      delay_days: null,
    });
    expect(
      adaptV2State(state, { [ids.concept]: { status: 'needs_practice', score: 0.42, reasons: [] } })
        .domains[0].concepts[0].last_practiced,
    ).toBe('2025-12-31T00:00:00.000Z');

    const legacy = {
      version: 1 as const,
      topic: 'Legacy',
      slug: 'legacy',
      created: '2025-01-01',
      domains: [],
    };
    __injectTestData({
      summaries: [topic],
      states: { legacy },
      knowledgeMaps: {},
      fileContents: {},
      v2Snapshots: { 'v2-topic': snapshot() },
    });
    expect(loadTopic('legacy')).toBe(legacy);
    expect(loadTopic('v2-topic')?.version).toBe(1);
    expect(loadTopicV2('v2-topic')?.state.version).toBe(2);
  });
});

describe('V2 review scheduling', () => {
  it('queues only due V2 concepts and keeps future/null due dates out', () => {
    const mastery = { status: 'needs_practice' as const, score: 0.3, reasons: [] };
    expect(
      computeV2ReviewPriority(
        v2State('2025-12-31T00:00:00.000Z').domains[0].concepts[0],
        mastery,
        topic,
        'Domain',
        Date.parse('2026-01-01T00:00:00.000Z'),
      ),
    ).not.toBeNull();
    expect(
      computeV2ReviewPriority(
        v2State('2026-01-02T00:00:00.000Z').domains[0].concepts[0],
        mastery,
        topic,
        'Domain',
        Date.parse('2026-01-01T00:00:00.000Z'),
      ),
    ).toBeNull();
    expect(
      computeV2ReviewPriority(
        v2State(null).domains[0].concepts[0],
        mastery,
        topic,
        'Domain',
        Date.parse('2026-01-01T00:00:00.000Z'),
      ),
    ).toBeNull();
    expect(
      computeV2ReviewPriority(
        v2State().domains[0].concepts[0],
        undefined,
        topic,
        'Domain',
        Date.parse('2026-01-01T00:00:00.000Z'),
      ),
    ).toBeNull();
  });
});

describe('idempotency keys', () => {
  it('uses getRandomValues when randomUUID is unavailable on an HTTP LAN origin', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(0xab));
    vi.stubGlobal('crypto', { getRandomValues });
    expect(createIdempotencyKey()).toBe('abababab-abab-4bab-abab-abababababab');
    expect(getRandomValues).toHaveBeenCalledOnce();
  });
});

describe('session transport state', () => {
  it('loads a session and retries a failed write with the identical idempotency key, timestamp and body', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sessions: [
              {
                id: ids.session,
                concept_id: ids.concept,
                concept_name: 'Concept',
                kind: 'study',
                locale: 'en',
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-02T00:00:00.000Z',
                revision,
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: session(), revision }), {
          status: 200,
          headers: { ETag: `"${revision}"` },
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'state_busy' }), { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            session: session('2026-01-02T00:00:01.000Z'),
            revision: 'b'.repeat(64),
          }),
          { status: 200, headers: { ETag: `"${'b'.repeat(64)}"` } },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const store = createSessionStore(
      'v2-topic',
      () => 'key-1',
      () => '2026-01-02T00:00:01.000Z',
    );

    await store.loadList();
    await store.select(ids.session);
    await store.save(ids.prompt, 'Draft');
    await store.retry(ids.prompt);

    const firstWrite = fetchMock.mock.calls[2];
    const retry = fetchMock.mock.calls[3];
    expect(firstWrite[0]).toBe(
      `/api/topics/v2-topic/sessions/${ids.session}/socratic/${ids.prompt}`,
    );
    expect(firstWrite[1].headers).toMatchObject({
      'If-Match': `"${revision}"`,
      'Idempotency-Key': 'key-1',
    });
    expect(retry[1].headers['Idempotency-Key']).toBe('key-1');
    expect(retry[1].body).toBe(firstWrite[1].body);
    expect(store.session.value?.updated_at).toBe('2026-01-02T00:00:01.000Z');
  });

  it('rebases a conflicted draft with a fresh key and timestamp after reload', async () => {
    const newer = 'c'.repeat(64);
    const rebased = 'd'.repeat(64);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: session(), revision }), {
          status: 200,
          headers: { ETag: `"${revision}"` },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'revision_conflict', revision: newer }), {
          status: 412,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ session: session('2026-01-02T00:00:05.000Z'), revision: newer }),
          { status: 200, headers: { ETag: `"${newer}"` } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ session: session('2026-01-02T00:00:06.000Z'), revision: rebased }),
          { status: 200 },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);
    const keys = ['key-2', 'key-3'];
    const store = createSessionStore(
      'v2-topic',
      () => keys.shift()!,
      () => '2026-01-02T00:00:01.000Z',
    );
    await store.select(ids.session);
    store.setDraft(ids.prompt, 'Local text');
    await store.save(ids.prompt);
    expect(store.drafts.value[ids.prompt]).toBe('Local text');
    expect(store.conflict.value).toBe(ids.prompt);
    await store.reload();
    expect(store.drafts.value[ids.prompt]).toBe('Local text');
    await store.save(ids.prompt);
    const rebasedWrite = fetchMock.mock.calls.at(-1)?.[1];
    expect(rebasedWrite.headers).toMatchObject({
      'If-Match': `"${newer}"`,
      'Idempotency-Key': 'key-3',
    });
    expect(JSON.parse(rebasedWrite.body)).toMatchObject({
      response: 'Local text',
      submitted_at: '2026-01-02T00:00:05.001Z',
    });
  });

  it('does not submit unchanged text, serializes concurrent writes, and keeps errors scoped to their prompt', async () => {
    const other = '00000000-0000-4000-8000-000000000010';
    let resolveWrite!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: twoPromptSession(), revision }), { status: 200 }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveWrite = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const store = createSessionStore(
      'v2-topic',
      () => 'key-3',
      () => '2026-01-02T00:00:01.000Z',
    );
    await store.select(ids.session);
    await store.save(ids.prompt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    store.setDraft(ids.prompt, 'Changed');
    const first = store.save(ids.prompt);
    await store.select(other);
    expect(store.selectedId.value).toBe(ids.session);
    await store.save(other, 'Other');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    resolveWrite(new Response(JSON.stringify({ error: 'state_busy' }), { status: 503 }));
    await first;
    expect(store.writeError.value).toBe(ids.prompt);
    expect(store.writeError.value).not.toBe(other);
    await store.select(other);
    expect(store.writeError.value).toBeNull();
  });

  it('drops an outdated retry when its draft changes and ignores stale detail responses', async () => {
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveSecond = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const store = createSessionStore(
      'v2-topic',
      () => 'key-4',
      () => '2026-01-02T00:00:01.000Z',
    );
    const first = store.select(ids.session);
    const secondId = '00000000-0000-4000-8000-000000000012';
    const second = store.select(secondId);
    resolveSecond(
      new Response(JSON.stringify({ session: { ...session(), id: secondId }, revision }), {
        status: 200,
      }),
    );
    resolveFirst(new Response(JSON.stringify({ session: session(), revision }), { status: 200 }));
    await Promise.all([first, second]);
    expect(store.selectedId.value).toBe(secondId);
    expect(store.session.value?.id).toBe(secondId);
  });

  it('clears a pending retry when the draft changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: session(), revision }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'state_busy' }), { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: session(), revision: 'e'.repeat(64) }), {
          status: 200,
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const keys = ['key-5', 'key-6'];
    const store = createSessionStore(
      'v2-topic',
      () => keys.shift()!,
      () => '2026-01-02T00:00:01.000Z',
    );
    await store.select(ids.session);
    await store.save(ids.prompt, 'First');
    store.setDraft(ids.prompt, 'Second');
    expect(store.writeError.value).toBeNull();
    await store.save(ids.prompt);
    expect(fetchMock.mock.calls.at(-1)?.[1].headers['Idempotency-Key']).toBe('key-6');
  });

  it('keeps an unsaved draft across A → B → A selection changes', async () => {
    const secondId = '00000000-0000-4000-8000-000000000012';
    const secondPrompt = '00000000-0000-4000-8000-000000000013';
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: session(), revision }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            session: {
              ...session(),
              id: secondId,
              socratic_prompts: [{ id: secondPrompt, prompt: 'Other?', responses: [] }],
            },
            revision,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ session: session(), revision }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const store = createSessionStore('v2-topic');
    await store.select(ids.session);
    store.setDraft(ids.prompt, 'Unsent answer');
    await store.select(secondId);
    await store.select(ids.session);
    expect(store.drafts.value[ids.prompt]).toBe('Unsent answer');
    expect(store.isDirty(ids.prompt)).toBe(true);
  });
});
