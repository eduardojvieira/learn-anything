import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTopic,
  IdempotencyConflictError,
  main,
  recordEvidence,
  recordSession,
  renderSession,
  SessionTimestampError,
  SessionTopicMismatchError,
  sessionSnapshot,
  snapshot,
  UnknownConceptError,
  UnknownQuestionError,
  UnknownSessionError,
  updateSocraticResponse,
} from '../../../src/learnctl/index.js';
import { StateConflictError } from '../../../src/core/state-store/index.js';
import { initializeLearnConfig } from '../../../src/core/learn-config.js';

let root: string;
let topicDir: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'sessions-'));
  topicDir = path.join(root, '.learn', 'topics', 'topic');
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
const topic = () => ({
  topic: 'TypeScript',
  created_at: '2026-01-01T00:00:00.000Z',
  domains: [
    {
      name: 'Basics',
      concepts: [
        { name: 'Types', details: [] },
        { name: 'Functions', details: [] },
      ],
    },
  ],
});

describe('canonical sessions', () => {
  it('uses Spanish explicitly and uses valid config as the default renderer locale', async () => {
    await createTopic(topicDir, topic());
    const current = await snapshot(topicDir);
    const created = await recordSession(topicDir, {
      expected_topic_revision: current.revision,
      idempotency_key: 'spanish',
      concept_id: current.state.domains[0].concepts[0].id,
      kind: 'study',
      locale: 'es',
      created_at: '2026-01-02T00:00:00.000Z',
      blocks: [{ kind: 'retrieval', text: 'Recordá.' }],
      socratic_prompts: ['¿Por qué?'],
    });
    await expect(renderSession(topicDir, created.session.id)).resolves.toMatchObject({
      path: expect.stringContaining('views/es.md'),
    });
    await expect(renderSession(topicDir, created.session.id, 'es')).resolves.toMatchObject({
      path: expect.stringContaining('views/es.md'),
    });
    const sessionPath = path.join(topicDir, 'sessions', created.session.id, 'session.json');
    const before = await fs.readFile(sessionPath);
    const learnDir = path.dirname(path.dirname(topicDir));
    await initializeLearnConfig(learnDir, 'es');
    expect((await snapshot(topicDir)).config).toMatchObject({
      locale: 'es',
      timezone: expect.any(String),
      numbering: 'hierarchical',
    });
    await expect(renderSession(topicDir, created.session.id)).resolves.toMatchObject({
      path: expect.stringContaining('views/es.md'),
    });
    expect(await fs.readFile(sessionPath)).toEqual(before);
    await fs.writeFile(path.join(learnDir, 'config.json'), '{invalid');
    await expect(snapshot(topicDir)).rejects.toThrow();
    await expect(renderSession(topicDir, created.session.id)).rejects.toThrow();
  });
  it('creates, answers, renders, and idempotently preserves a session without changing state.json', async () => {
    await createTopic(topicDir, topic());
    const current = await snapshot(topicDir);
    const conceptId = current.state.domains[0].concepts[0].id;
    const otherConceptId = current.state.domains[0].concepts[1].id;
    const request = {
      expected_topic_revision: current.revision,
      idempotency_key: 'one',
      concept_id: conceptId,
      kind: 'study',
      locale: 'en',
      created_at: '2026-01-02T00:00:00.000Z',
      blocks: [{ kind: 'retrieval', text: 'Recall unions.' }],
      socratic_prompts: ['Why?'],
    };
    const created = await recordSession(topicDir, request);
    expect((await snapshot(topicDir)).revision).toBe(current.revision);
    expect(
      await recordSession(topicDir, { ...request, expected_topic_revision: '0'.repeat(64) }),
    ).toMatchObject({ revision: created.revision });
    await expect(recordSession(topicDir, { ...request, kind: 'quiz' })).rejects.toBeInstanceOf(
      IdempotencyConflictError,
    );
    await expect(
      recordSession(topicDir, {
        ...request,
        idempotency_key: 'missing',
        concept_id: '00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toBeInstanceOf(UnknownConceptError);
    const questionId = created.session.socratic_prompts[0].id;
    const answered = await updateSocraticResponse(topicDir, created.session.id, {
      expected_revision: created.revision,
      idempotency_key: 'answer',
      question_id: questionId,
      response: 'Because types narrow.',
      submitted_at: '2026-01-03T00:00:00.000Z',
    });
    expect(answered.session.socratic_prompts[0].responses).toHaveLength(1);
    expect(
      (
        await updateSocraticResponse(topicDir, created.session.id, {
          expected_revision: created.revision,
          idempotency_key: 'answer',
          question_id: questionId,
          response: 'Because types narrow.',
          submitted_at: '2026-01-03T00:00:00.000Z',
        })
      ).revision,
    ).toBe(answered.revision);
    await expect(
      updateSocraticResponse(topicDir, created.session.id, {
        expected_revision: answered.revision,
        idempotency_key: 'answer',
        question_id: questionId,
        response: 'Different.',
        submitted_at: '2026-01-03T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    await expect(
      updateSocraticResponse(topicDir, created.session.id, {
        expected_revision: answered.revision,
        idempotency_key: 'missing-question',
        question_id: '00000000-0000-4000-8000-000000000099',
        response: '',
        submitted_at: '2026-01-04T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(UnknownQuestionError);
    expect(await renderSession(topicDir, created.session.id)).toMatchObject({
      revision: answered.revision,
    });
    await expect(
      fs.readFile(path.join(topicDir, 'sessions', created.session.id, 'views', 'en.md'), 'utf8'),
    ).resolves.toContain('Because types narrow.');
    await expect(
      recordEvidence(topicDir, {
        expected_revision: current.revision,
        idempotency_key: 'bad-session',
        concept_id: conceptId,
        kind: 'practice',
        observed_at: '2026-01-03T00:00:00.000Z',
        score: 0.9,
        session_id: '00000000-0000-4000-8000-000000000099',
      }),
    ).rejects.toBeInstanceOf(UnknownSessionError);
    await expect(
      recordEvidence(topicDir, {
        expected_revision: current.revision,
        idempotency_key: 'wrong-concept-session',
        concept_id: otherConceptId,
        kind: 'practice',
        observed_at: '2026-01-03T00:00:00.000Z',
        score: 0.9,
        session_id: created.session.id,
      }),
    ).rejects.toBeInstanceOf(SessionTopicMismatchError);
    const evidence = await recordEvidence(topicDir, {
      expected_revision: current.revision,
      idempotency_key: 'valid-session',
      concept_id: conceptId,
      kind: 'practice',
      observed_at: '2026-01-03T00:00:00.000Z',
      score: 0.9,
      session_id: created.session.id,
    });
    expect(evidence.state.domains[0].concepts[0].evidence).toContainEqual(
      expect.objectContaining({ session_id: created.session.id }),
    );
    await expect(
      updateSocraticResponse(topicDir, created.session.id, {
        expected_revision: answered.revision,
        idempotency_key: 'early',
        question_id: questionId,
        response: '',
        submitted_at: '2026-01-02T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(SessionTimestampError);
    expect((await sessionSnapshot(topicDir, created.session.id)).session.id).toBe(
      created.session.id,
    );
  });

  it('preserves session and topic bytes across conflicts, tampering, evidence, and concurrent renders', async () => {
    await createTopic(topicDir, topic());
    const initial = await snapshot(topicDir);
    const conceptId = initial.state.domains[0].concepts[0].id;
    const request = {
      expected_topic_revision: initial.revision,
      idempotency_key: 'matrix',
      concept_id: conceptId,
      kind: 'study' as const,
      locale: 'en' as const,
      created_at: '2026-01-02T00:00:00.000Z',
      blocks: [{ kind: 'retrieval' as const, text: 'Recall.' }],
      socratic_prompts: ['Why?', 'How?'],
    };
    const created = await recordSession(topicDir, request);
    expect(
      await recordSession(topicDir, { ...request, expected_topic_revision: '0'.repeat(64) }),
    ).toMatchObject({ session: { id: created.session.id }, revision: created.revision });
    await expect(
      recordSession(topicDir, {
        ...request,
        idempotency_key: 'stale',
        expected_topic_revision: '0'.repeat(64),
      }),
    ).rejects.toBeInstanceOf(StateConflictError);
    await expect(
      recordSession(topicDir, {
        ...request,
        idempotency_key: 'early-session',
        created_at: '2025-12-31T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(SessionTimestampError);
    const [first, second] = created.session.socratic_prompts;
    const responseA = await updateSocraticResponse(topicDir, created.session.id, {
      expected_revision: created.revision,
      idempotency_key: 'block:0',
      question_id: first.id,
      response: 'A',
      submitted_at: '2026-01-03T00:00:00.000Z',
    });
    const responseB = await updateSocraticResponse(topicDir, created.session.id, {
      expected_revision: responseA.revision,
      idempotency_key: 'prompt:0',
      question_id: second.id,
      response: 'B',
      submitted_at: '2026-01-04T00:00:00.000Z',
    });
    const ids = new Set([
      ...responseB.session.blocks.map((entry) => entry.id),
      ...responseB.session.socratic_prompts.flatMap((entry) => [
        entry.id,
        ...entry.responses.map((response) => response.id),
      ]),
    ]);
    expect(ids.size).toBe(5);
    expect(responseB.session.socratic_prompts.flatMap((entry) => entry.responses)).toHaveLength(2);
    const sessionPath = path.join(topicDir, 'sessions', created.session.id, 'session.json');
    const beforeSession = await fs.readFile(sessionPath);
    await expect(
      updateSocraticResponse(topicDir, created.session.id, {
        expected_revision: created.revision,
        idempotency_key: 'stale-update',
        question_id: first.id,
        response: 'C',
        submitted_at: '2026-01-05T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(StateConflictError);
    expect(await fs.readFile(sessionPath)).toEqual(beforeSession);
    await expect(
      updateSocraticResponse(topicDir, created.session.id, {
        expected_revision: responseB.revision,
        idempotency_key: 'block:0',
        question_id: second.id,
        response: 'changed',
        submitted_at: '2026-01-05T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);
    const stateBeforeEvidence = await snapshot(topicDir);
    const evidence = await recordEvidence(topicDir, {
      expected_revision: stateBeforeEvidence.revision,
      idempotency_key: 'evidence',
      concept_id: conceptId,
      kind: 'practice',
      observed_at: '2026-01-05T00:00:00.000Z',
      score: 0.9,
      session_id: created.session.id,
    });
    expect(evidence.revision).not.toBe(stateBeforeEvidence.revision);
    expect(await fs.readFile(sessionPath)).toEqual(beforeSession);
    expect((await sessionSnapshot(topicDir, created.session.id)).revision).toBe(responseB.revision);
    await expect(
      recordEvidence(topicDir, {
        expected_revision: evidence.revision,
        idempotency_key: 'early-evidence',
        concept_id: conceptId,
        kind: 'practice',
        observed_at: '2026-01-01T00:00:00.000Z',
        score: 0.9,
        session_id: created.session.id,
      }),
    ).rejects.toBeInstanceOf(SessionTimestampError);
    const renders = await Promise.all([
      renderSession(topicDir, created.session.id),
      renderSession(topicDir, created.session.id),
    ]);
    expect(renders[0]).toEqual(renders[1]);
    expect(await fs.readFile(sessionPath)).toEqual(beforeSession);
    expect((await snapshot(topicDir)).revision).toBe(evidence.revision);
    expect(
      await fs.readdir(path.join(topicDir, 'sessions', created.session.id, 'views')),
    ).not.toContainEqual(expect.stringMatching(/\.md\.tmp-/));
  });

  it('rejects schema-valid sessions bound to the wrong path or topic without writing', async () => {
    await createTopic(topicDir, topic());
    const current = await snapshot(topicDir);
    const conceptId = current.state.domains[0].concepts[0].id;
    const created = await recordSession(topicDir, {
      expected_topic_revision: current.revision,
      idempotency_key: 'tamper',
      concept_id: conceptId,
      kind: 'study',
      locale: 'en',
      created_at: '2026-01-02T00:00:00.000Z',
      blocks: [{ kind: 'retrieval', text: 'Recall.' }],
      socratic_prompts: ['Why?'],
    });
    const sessionPath = path.join(topicDir, 'sessions', created.session.id, 'session.json');
    const tampered = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
    tampered.id = '00000000-0000-4000-8000-000000000099';
    await fs.writeFile(sessionPath, `${JSON.stringify(tampered, null, 2)}\n`);
    const bytes = await fs.readFile(sessionPath);
    await expect(sessionSnapshot(topicDir, created.session.id)).rejects.toBeInstanceOf(
      SessionTopicMismatchError,
    );
    await expect(
      updateSocraticResponse(topicDir, created.session.id, {
        expected_revision: created.revision,
        idempotency_key: 'no-write',
        question_id: created.session.socratic_prompts[0].id,
        response: 'No.',
        submitted_at: '2026-01-03T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(SessionTopicMismatchError);
    expect(await fs.readFile(sessionPath)).toEqual(bytes);
    tampered.id = created.session.id;
    tampered.topic_id = '00000000-0000-4000-8000-000000000098';
    await fs.writeFile(sessionPath, `${JSON.stringify(tampered, null, 2)}\n`);
    const topicMismatchBytes = await fs.readFile(sessionPath);
    await expect(sessionSnapshot(topicDir, created.session.id)).rejects.toBeInstanceOf(
      SessionTopicMismatchError,
    );
    await expect(
      updateSocraticResponse(topicDir, created.session.id, {
        expected_revision: created.revision,
        idempotency_key: 'topic-no-write',
        question_id: created.session.socratic_prompts[0].id,
        response: 'No.',
        submitted_at: '2026-01-03T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(SessionTopicMismatchError);
    expect(await fs.readFile(sessionPath)).toEqual(topicMismatchBytes);
  });

  it('exposes canonical session commands with stable errors', async () => {
    await createTopic(topicDir, topic());
    const current = await snapshot(topicDir);
    const conceptId = current.state.domains[0].concepts[0].id;
    const payloadPath = path.join(root, 'session.json');
    await fs.writeFile(
      payloadPath,
      JSON.stringify({
        expected_topic_revision: current.revision,
        idempotency_key: 'cli',
        concept_id: conceptId,
        kind: 'quiz',
        locale: 'zh-CN',
        created_at: '2026-01-02T00:00:00.000Z',
        blocks: [{ kind: 'diagnostic', text: '测试' }],
        socratic_prompts: ['为什么？'],
      }),
    );
    const lines: string[] = [];
    const io = {
      stdout: { write: (line: string) => lines.push(line) },
      stderr: { write: (line: string) => lines.push(line) },
    };
    expect(await main(['record-session', topicDir, payloadPath], io)).toBe(0);
    const id = JSON.parse(lines[0]).session.id;
    expect(await main(['session-snapshot', topicDir, id], io)).toBe(0);
    const questionId = JSON.parse(lines[1]).session.socratic_prompts[0].id;
    const answerPath = path.join(root, 'answer.json');
    await fs.writeFile(
      answerPath,
      JSON.stringify({
        expected_revision: JSON.parse(lines[1]).revision,
        idempotency_key: 'answer',
        question_id: questionId,
        response: '因为。',
        submitted_at: '2026-01-03T00:00:00.000Z',
      }),
    );
    expect(await main(['update-socratic-response', topicDir, id, answerPath], io)).toBe(0);
    expect(await main(['render-session', topicDir, id, 'zh-CN'], io)).toBe(0);
    expect(await main(['session-snapshot', topicDir, 'not-a-uuid'], io)).toBe(4);
  });
});
