import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTopic,
  IdempotencyConflictError,
  main,
  migrate,
  recordAssessment,
  recordEvidence,
  render,
  snapshot,
  UnknownConceptError,
} from '../../../src/learnctl/index.js';

let root: string;
let topicDir: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'learnctl-'));
  topicDir = path.join(root, 'typescript');
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const payload = () => ({
  topic: 'TypeScript',
  created_at: '2026-01-01T00:00:00.000Z',
  domains: [{ name: 'Basics', concepts: [{ name: 'Types', details: ['Union Types'] }] }],
});

describe('learnctl core', () => {
  it('creates a strict V2 topic with generated identity and deterministic defaults', async () => {
    const created = await createTopic(topicDir, payload());
    const concept = created.state.domains[0].concepts[0];
    expect(created.state).toMatchObject({
      version: 2,
      topic: 'TypeScript',
      slug: 'typescript',
      updated_at: payload().created_at,
    });
    expect(created.state.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(concept).toMatchObject({
      slug: 'types',
      prerequisites: [],
      relations: [],
      evidence: [],
    });
    expect(concept.details[0]).toMatchObject({ name: 'Union Types', slug: 'union-types' });
    expect(concept.calibration).toEqual({
      predicted_score: null,
      observed_score: null,
      samples: 0,
      updated_at: null,
    });
    expect(concept.review).toMatchObject({ state: 'new', reps: 0, lapses: 0 });
    await expect(
      createTopic(path.join(root, 'invalid'), { ...payload(), extra: true }),
    ).rejects.toThrow();
  });

  it('returns snapshot revision and derived numbering without mutation', async () => {
    await createTopic(topicDir, payload());
    const first = await snapshot(topicDir);
    const second = await snapshot(topicDir);
    expect(first.revision).toBe(second.revision);
    expect(first.numbering).toEqual({
      [first.state.domains[0].id]: '1',
      [first.state.domains[0].concepts[0].id]: '1.1',
      [first.state.domains[0].concepts[0].details[0].id]: '1.1.1',
    });
    expect(first.mastery[first.state.domains[0].concepts[0].id]).toMatchObject({
      status: 'unexplored',
      score: 0,
    });
  });

  it('renders only a deterministic derived knowledge map', async () => {
    await createTopic(topicDir, payload());
    const before = await snapshot(topicDir);
    const result = await render(topicDir);
    expect(await fs.readFile(result.path, 'utf8')).toBe(
      '# TypeScript\n\n## 1 Basics\n- 1.1 Types\n  - 1.1.1 Union Types\n',
    );
    expect((await snapshot(topicDir)).state).toEqual(before.state);
    expect(result.revision).toBe(before.revision);
  });

  it('delegates V1 migration through the runtime API', async () => {
    await fs.mkdir(topicDir, { recursive: true });
    await fs.writeFile(
      path.join(topicDir, 'state.json'),
      `${JSON.stringify(
        {
          version: 1,
          topic: 'V1',
          slug: 'v1',
          created: '2026-01-01',
          domains: [],
        },
        null,
        2,
      )}\n`,
    );
    expect(await migrate(topicDir)).toMatchObject({ migrated: true, topic: 'V1' });
    expect((await snapshot(topicDir)).state.version).toBe(2);
  });

  it('appends controlled evidence with idempotency, derived delay, and calibration', async () => {
    await createTopic(topicDir, payload());
    const first = await snapshot(topicDir);
    const conceptId = first.state.domains[0].concepts[0].id;
    const request = {
      expected_revision: first.revision,
      idempotency_key: 'first',
      concept_id: conceptId,
      kind: 'practice',
      observed_at: '2026-01-02T00:00:00.000Z',
      score: 0.9,
      predicted_score: 0.7,
    };
    const written = await recordEvidence(topicDir, request);
    expect(written.state.domains[0].concepts[0].evidence[0]).toMatchObject({
      source: 'learnctl',
      predicted_score: 0.7,
      delay_days: null,
    });
    expect(written.state.domains[0].concepts[0].review).toEqual(
      first.state.domains[0].concepts[0].review,
    );
    expect(written.state.domains[0].concepts[0].calibration).toMatchObject({
      predicted_score: 0.7,
      observed_score: 0.9,
      samples: 1,
    });
    expect((await snapshot(topicDir)).mastery[conceptId]).toMatchObject({
      status: 'in_progress',
      score: 0.9,
    });
    const retried = await recordEvidence(topicDir, {
      ...request,
      expected_revision: first.revision,
    });
    expect(retried.revision).toBe(written.revision);
    await expect(recordEvidence(topicDir, { ...request, score: 0.8 })).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );
    await expect(
      recordEvidence(topicDir, { ...request, predicted_score: 0.6 }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);

    const delayed = await recordEvidence(topicDir, {
      expected_revision: written.revision,
      idempotency_key: 'delayed',
      concept_id: conceptId,
      kind: 'delayed_assessment',
      observed_at: '2026-01-05T00:00:00.000Z',
      score: 0.9,
    });
    expect(delayed.state.domains[0].concepts[0].evidence[1]).toMatchObject({
      predicted_score: null,
      delay_days: 3,
    });
  });

  it('rejects unsafe evidence payloads and unknown concepts', async () => {
    await createTopic(topicDir, payload());
    const current = await snapshot(topicDir);
    const base = {
      expected_revision: current.revision,
      idempotency_key: 'low',
      concept_id: current.state.domains[0].concepts[0].id,
      kind: 'practice',
      observed_at: '2026-01-02T00:00:00.000Z',
      score: 0.2,
    };
    await expect(recordEvidence(topicDir, base)).rejects.toThrow();
    await expect(
      recordEvidence(topicDir, {
        ...base,
        feedback: 'missed',
        idempotency_key: 'unknown',
        concept_id: '00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toBeInstanceOf(UnknownConceptError);
  });

  it('records an assessment atomically with review state and idempotency', async () => {
    await createTopic(topicDir, payload());
    const first = await snapshot(topicDir);
    const conceptId = first.state.domains[0].concepts[0].id;
    const request = {
      expected_revision: first.revision,
      idempotency_key: 'assessment',
      concept_id: conceptId,
      kind: 'practice',
      observed_at: '2026-01-02T00:00:00.000Z',
      score: 0.9,
      rating: 'good' as const,
    };
    const written = await recordAssessment(topicDir, request);
    const concept = written.state.domains[0].concepts[0];
    expect(concept.evidence[0]).toMatchObject({ review_rating: 'good', source: 'learnctl' });
    expect(concept.review).toMatchObject({
      state: 'review',
      reps: 1,
      scheduled_days: 3,
      due_at: '2026-01-05T00:00:00.000Z',
    });
    expect(
      (await recordAssessment(topicDir, { ...request, expected_revision: first.revision }))
        .revision,
    ).toBe(written.revision);
    await expect(recordAssessment(topicDir, { ...request, rating: 'easy' })).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );
    const before = await snapshot(topicDir);
    await expect(
      recordAssessment(topicDir, {
        ...request,
        idempotency_key: 'old',
        expected_revision: before.revision,
        observed_at: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow();
    expect((await snapshot(topicDir)).revision).toBe(before.revision);
  });
});

describe('learnctl CLI', () => {
  it('writes one JSON line and uses stable usage/existing error codes', async () => {
    const payloadPath = path.join(root, 'payload.json');
    await fs.writeFile(payloadPath, JSON.stringify(payload()));
    const lines = { out: '', err: '' };
    const io = {
      stdout: {
        write: (value: string) => {
          lines.out += value;
        },
      },
      stderr: {
        write: (value: string) => {
          lines.err += value;
        },
      },
    };

    expect(await main(['init-topic', topicDir, payloadPath], io)).toBe(0);
    expect(lines.out.trim()).toMatch(/^\{.*\}$/);
    expect(lines.out.split('\n')).toHaveLength(2);
    lines.out = '';
    expect(await main(['init-topic', topicDir, payloadPath], io)).toBe(3);
    expect(JSON.parse(lines.err.trim()).error).toBe('StateAlreadyExistsError');
    lines.out = '';
    lines.err = '';
    const current = await snapshot(topicDir);
    await fs.writeFile(
      payloadPath,
      JSON.stringify({
        expected_revision: current.revision,
        idempotency_key: 'cli',
        concept_id: current.state.domains[0].concepts[0].id,
        kind: 'diagnostic',
        observed_at: '2026-01-02T00:00:00.000Z',
        score: 0.9,
      }),
    );
    expect(await main(['record-evidence', topicDir, payloadPath], io)).toBe(0);
    const assessed = await snapshot(topicDir);
    await fs.writeFile(
      payloadPath,
      JSON.stringify({
        expected_revision: assessed.revision,
        idempotency_key: 'assessment-cli',
        concept_id: assessed.state.domains[0].concepts[0].id,
        kind: 'practice',
        observed_at: '2026-01-03T00:00:00.000Z',
        score: 0.9,
        rating: 'good',
      }),
    );
    expect(await main(['record-assessment', topicDir, payloadPath], io)).toBe(0);
    const beforeOutOfOrder = await snapshot(topicDir);
    await fs.writeFile(
      payloadPath,
      JSON.stringify({
        expected_revision: beforeOutOfOrder.revision,
        idempotency_key: 'assessment-old-cli',
        concept_id: beforeOutOfOrder.state.domains[0].concepts[0].id,
        kind: 'practice',
        observed_at: '2026-01-02T00:00:00.000Z',
        score: 0.9,
        rating: 'good',
      }),
    );
    lines.err = '';
    expect(await main(['record-assessment', topicDir, payloadPath], io)).toBe(3);
    expect(JSON.parse(lines.err.trim()).error).toBe('ReviewOutOfOrderError');
    expect((await snapshot(topicDir)).revision).toBe(beforeOutOfOrder.revision);
    expect(await main(['study', topicDir, '2026-01-03T00:00:00.000Z'], io)).toBe(0);
    lines.err = '';
    expect(await main(['unknown'], io)).toBe(2);
    expect(JSON.parse(lines.err.trim()).error).toBe('UsageError');
    lines.err = '';
    await fs.writeFile(payloadPath, '{broken');
    expect(await main(['init-topic', path.join(root, 'bad'), payloadPath], io)).toBe(4);
    expect(JSON.parse(lines.err.trim()).error).toBe('LearnctlPayloadError');
    lines.err = '';
    const corruptDir = path.join(root, 'corrupt');
    await fs.mkdir(corruptDir);
    await fs.writeFile(path.join(corruptDir, 'state.json'), '{broken');
    expect(await main(['snapshot', corruptDir], io)).toBe(4);
    expect(JSON.parse(lines.err.trim()).error).toBe('StateCorruptionError');

    const packageJson = JSON.parse(
      await fs.readFile(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'),
    );
    expect(packageJson.bin.learnctl).toBe('./bin/learnctl.js');
  });
});
