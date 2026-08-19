import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleDashboardApi, respondDashboardError } from '../src/dashboard-api.js';
import { StateLockTimeoutError } from '../src/core/state-store/index.js';
import { createTopic, recordSession, sessionSnapshot, snapshot } from '../src/learnctl/index.js';

let root: string;
let topicsDir: string;
let base: string;
let topicDir: string;
let close: () => Promise<void>;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'dashboard-api-'));
  topicsDir = path.join(root, 'topics');
  topicDir = path.join(topicsDir, 'typescript');
  await createTopic(topicDir, {
    topic: 'TypeScript',
    created_at: '2026-01-01T00:00:00.000Z',
    domains: [{ name: 'Basics', concepts: [{ name: 'Types', details: [] }] }],
  });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!(await handleDashboardApi(req, res, topicsDir, url.pathname))) {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  base = `http://127.0.0.1:${address.port}`;
  close = () =>
    new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});
afterEach(async () => {
  await close();
  await fs.rm(root, { recursive: true, force: true });
});

const request = (url: string, init: RequestInit = {}) => fetch(`${base}${url}`, init);
const origin = () => new URL(base).origin;
async function seededSession() {
  const current = await snapshot(topicDir);
  const conceptId = current.state.domains[0].concepts[0].id;
  return recordSession(topicDir, {
    expected_topic_revision: current.revision,
    idempotency_key: 'session',
    concept_id: conceptId,
    kind: 'study',
    locale: 'en',
    created_at: '2026-01-02T00:00:00.000Z',
    blocks: [{ kind: 'retrieval', text: 'Recall.' }],
    socratic_prompts: ['Why?'],
  });
}
function writeHeaders(revision: string, key = 'answer') {
  return {
    Origin: origin(),
    'Content-Type': 'application/json',
    'If-Match': `"${revision}"`,
    'Idempotency-Key': key,
  };
}

describe('dashboard V2 API', () => {
  it('initializes config on GET and applies CAS/replay rules on PUT', async () => {
    const first = await request('/api/config');
    expect(first.status).toBe(200);
    const initial = (await first.json()) as {
      config: { version: 1; locale: string; timezone: string; numbering: string };
      revision: string;
    };
    expect(initial.config).toMatchObject({ version: 1, numbering: 'hierarchical' });
    expect(first.headers.get('etag')).toBe(`"${initial.revision}"`);
    const next = { ...initial.config, locale: 'es' };
    const headers = {
      Origin: origin(),
      'Content-Type': 'application/json',
      'If-Match': `"${initial.revision}"`,
    };
    const updated = await request('/api/config', {
      method: 'PUT',
      headers,
      body: JSON.stringify(next),
    });
    expect(updated.status).toBe(200);
    const result = (await updated.json()) as { config: typeof next; revision: string };
    expect(result.config).toEqual(next);
    expect(
      (await request('/api/config', { method: 'PUT', headers, body: JSON.stringify(next) })).status,
    ).toBe(200);
    expect(
      (
        await request('/api/config', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...next, locale: 'en' }),
        })
      ).status,
    ).toBe(412);
  });

  it('rejects invalid config writes without changing canonical bytes', async () => {
    const read = await request('/api/config');
    const current = (await read.json()) as { config: Record<string, unknown>; revision: string };
    const configPath = path.join(root, 'config.json');
    const before = await fs.readFile(configPath);
    const headers = {
      Origin: origin(),
      'Content-Type': 'application/json',
      'If-Match': `"${current.revision}"`,
    };
    const cases: Array<[RequestInit, number]> = [
      [
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'If-Match': `"${current.revision}"` },
          body: '{}',
        },
        403,
      ],
      [{ method: 'PUT', headers: { ...headers, Origin: 'http://elsewhere' }, body: '{}' }, 403],
      [
        {
          method: 'PUT',
          headers: { Origin: origin(), 'If-Match': `"${current.revision}"` },
          body: '{}',
        },
        415,
      ],
      [
        {
          method: 'PUT',
          headers: { Origin: origin(), 'Content-Type': 'application/json' },
          body: '{}',
        },
        428,
      ],
      [{ method: 'PUT', headers: { ...headers, 'If-Match': 'bad' }, body: '{}' }, 400],
      [{ method: 'PUT', headers, body: '{' }, 400],
      [{ method: 'PUT', headers, body: JSON.stringify({ ...current.config, locale: 'fr' }) }, 400],
      [
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...current.config, timezone: 'Not/AZone' }),
        },
        400,
      ],
      [{ method: 'PUT', headers, body: JSON.stringify({ ...current.config, extra: true }) }, 400],
      [
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ ...current.config, padding: 'x'.repeat(70_000) }),
        },
        413,
      ],
    ];
    for (const [init, status] of cases) {
      expect((await request('/api/config', init)).status).toBe(status);
      expect(await fs.readFile(configPath)).toEqual(before);
    }
    const method = await request('/api/config', { method: 'POST' });
    expect(method.status).toBe(405);
    expect(method.headers.get('allow')).toBe('GET, PUT');
  });

  it.runIf(process.platform !== 'win32')(
    'fails closed for corrupt and symlinked config artifacts',
    async () => {
      const configPath = path.join(root, 'config.json');
      await fs.writeFile(configPath, '{bad');
      expect((await request('/api/config')).status).toBe(500);
      await fs.unlink(configPath);
      const external = path.join(root, 'external-config.json');
      await fs.writeFile(
        external,
        JSON.stringify({ version: 1, locale: 'en', timezone: 'UTC', numbering: 'hierarchical' }),
      );
      await fs.symlink(external, configPath);
      expect((await request('/api/config')).status).toBe(403);
      expect(await fs.readFile(external, 'utf8')).toContain('"en"');
      await fs.unlink(configPath);
      await fs.writeFile(
        configPath,
        JSON.stringify({ version: 1, locale: 'en', timezone: 'UTC', numbering: 'hierarchical' }),
      );
      await fs.symlink(external, path.join(root, '.config.json.lock'));
      expect((await request('/api/config')).status).toBe(403);
    },
  );

  it.runIf(process.platform !== 'win32')(
    'rejects a symlinked learn root without changing its config',
    async () => {
      await request('/api/config');
      const configPath = path.join(root, 'config.json');
      const before = await fs.readFile(configPath);
      const realRoot = `${root}-real`;
      await fs.rename(root, realRoot);
      await fs.symlink(realRoot, root);
      try {
        expect((await request('/api/config')).status).toBe(403);
        expect(await fs.readFile(path.join(realRoot, 'config.json'))).toEqual(before);
      } finally {
        await fs.unlink(root);
        await fs.rename(realRoot, root);
      }
    },
  );
  it('lists and reads canonical sessions with individual revisions and ETag', async () => {
    const created = await seededSession();
    const listed = await request('/api/topics/typescript/sessions');
    expect(listed.status).toBe(200);
    expect((await listed.json()).sessions).toEqual([
      expect.objectContaining({ id: created.session.id, revision: created.revision }),
    ]);
    const detail = await request(`/api/topics/typescript/sessions/${created.session.id}`);
    expect(detail.headers.get('etag')).toBe(`"${created.revision}"`);
    expect(await detail.json()).toEqual({ session: created.session, revision: created.revision });
  });

  it('writes a Socratic answer once, retries exactly, and rejects stale/key-conflicting writes', async () => {
    const created = await seededSession();
    const questionId = created.session.socratic_prompts[0].id;
    const body = JSON.stringify({
      response: 'Because types.',
      submitted_at: '2026-01-03T00:00:00.000Z',
    });
    const url = `/api/topics/typescript/sessions/${created.session.id}/socratic/${questionId}`;
    const first = await request(url, {
      method: 'PUT',
      headers: writeHeaders(created.revision),
      body,
    });
    expect(first.status).toBe(200);
    const result = await first.json();
    const retry = await request(url, {
      method: 'PUT',
      headers: writeHeaders(created.revision),
      body,
    });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(result);
    const stale = await request(url, {
      method: 'PUT',
      headers: writeHeaders(created.revision, 'stale'),
      body,
    });
    expect(stale.status).toBe(412);
    expect(stale.headers.get('etag')).toBe(`"${result.revision}"`);
    const conflicting = await request(url, {
      method: 'PUT',
      headers: writeHeaders(result.revision),
      body: JSON.stringify({ response: 'Changed.', submitted_at: '2026-01-03T00:00:00.000Z' }),
    });
    expect(conflicting.status).toBe(409);
    expect(
      (await sessionSnapshot(topicDir, created.session.id)).session.socratic_prompts[0].responses,
    ).toHaveLength(1);
  });

  it('records an assessment idempotently without accepting arbitrary mastery', async () => {
    const current = await snapshot(topicDir);
    const conceptId = current.state.domains[0].concepts[0].id;
    const body = JSON.stringify({
      concept_id: conceptId,
      kind: 'practice',
      observed_at: '2026-01-03T00:00:00.000Z',
      score: 0.9,
      rating: 'good',
    });
    const first = await request('/api/topics/typescript/assessments', {
      method: 'POST',
      headers: writeHeaders(current.revision, 'assessment'),
      body,
    });
    expect(first.status).toBe(200);
    const result = await first.json();
    const retry = await request('/api/topics/typescript/assessments', {
      method: 'POST',
      headers: writeHeaders(current.revision, 'assessment'),
      body,
    });
    expect(await retry.json()).toEqual(result);
    const stale = await request('/api/topics/typescript/assessments', {
      method: 'POST',
      headers: writeHeaders(current.revision, 'new-key'),
      body,
    });
    expect(stale.status).toBe(412);
    expect((await snapshot(topicDir)).state.domains[0].concepts[0].evidence).toHaveLength(1);
    const rejected = await request('/api/topics/typescript/assessments', {
      method: 'POST',
      headers: writeHeaders(result.revision, 'bad'),
      body: JSON.stringify({
        concept_id: conceptId,
        kind: 'practice',
        observed_at: '2026-01-04T00:00:00.000Z',
        score: 0.9,
        rating: 'good',
        mastery: 'mastered',
      }),
    });
    expect(rejected.status).toBe(400);
  });

  it('enforces origin, JSON, size, preconditions, reserved fields, method, and traversal boundaries', async () => {
    const created = await seededSession();
    const questionId = created.session.socratic_prompts[0].id;
    const url = `/api/topics/typescript/sessions/${created.session.id}/socratic/${questionId}`;
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: { ...writeHeaders(created.revision), Origin: 'http://elsewhere' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: {
            Origin: origin(),
            'If-Match': `"${created.revision}"`,
            'Idempotency-Key': 'x',
          },
          body: '{}',
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: { Origin: origin(), 'Content-Type': 'application/json', 'Idempotency-Key': 'x' },
          body: '{}',
        })
      ).status,
    ).toBe(428);
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: { ...writeHeaders(created.revision), 'If-Match': 'bad' },
          body: '{}',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: {
            Origin: origin(),
            'Content-Type': 'application/json',
            'If-Match': `"${created.revision}"`,
          },
          body: '{}',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: { ...writeHeaders(created.revision), 'Idempotency-Key': '  ' },
          body: '{}',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: { ...writeHeaders(created.revision), 'Idempotency-Key': 'x'.repeat(201) },
          body: '{}',
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(url, { method: 'PUT', headers: writeHeaders(created.revision), body: '{' }))
        .status,
    ).toBe(400);
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: writeHeaders(created.revision),
          body: JSON.stringify({ response: 'x'.repeat(70_000) }),
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await request(url, {
          method: 'PUT',
          headers: writeHeaders(created.revision),
          body: JSON.stringify({
            response: 'x',
            submitted_at: '2026-01-03T00:00:00.000Z',
            question_id: questionId,
          }),
        })
      ).status,
    ).toBe(400);
    expect(
      (await request(`/api/topics/typescript/sessions/00000000-0000-4000-8000-000000000001`))
        .status,
    ).toBe(404);
    expect(
      (
        await request(
          `/api/topics/typescript/sessions/${created.session.id}/socratic/00000000-0000-4000-8000-000000000001`,
          {
            method: 'PUT',
            headers: writeHeaders(created.revision),
            body: JSON.stringify({ response: 'x', submitted_at: '2026-01-03T00:00:00.000Z' }),
          },
        )
      ).status,
    ).toBe(404);
    expect((await request(`/api/topics/%2e%2e/sessions/${created.session.id}`)).status).toBe(404);
    const methods = await request(`/api/topics/typescript/sessions/${created.session.id}`, {
      method: 'POST',
    });
    expect(methods.status).toBe(405);
    expect(methods.headers.get('allow')).toBe('GET');
  });

  it('does not expose corrupt session state and maps lock timeouts for retry', async () => {
    const created = await seededSession();
    const sessionPath = path.join(topicDir, 'sessions', created.session.id, 'session.json');
    await fs.writeFile(sessionPath, '{corrupt');
    const corrupt = await request(`/api/topics/typescript/sessions/${created.session.id}`);
    expect(corrupt.status).toBe(500);
    expect(await corrupt.json()).toEqual({ error: 'state_unavailable' });
    const response = {
      writeHead: (status: number, headers: Record<string, string>) => {
        response.status = status;
        response.headers = headers;
      },
      end: (body: string) => {
        response.body = body;
      },
      status: 0,
      headers: {},
      body: '',
    };
    respondDashboardError(response as never, new StateLockTimeoutError('/private/path', 5));
    expect(response).toMatchObject({
      status: 503,
      headers: { 'Retry-After': '1' },
      body: JSON.stringify({ error: 'state_busy' }),
    });
  });

  it('keeps LAN/SSE wiring constrained without changing the listener host', async () => {
    const source = await fs.readFile(path.join(process.cwd(), 'site', 'serve.mjs'), 'utf8');
    expect(source).toContain('server.listen(PORT, () =>');
    expect(source).not.toContain("'Access-Control-Allow-Origin': '*'");
    expect(source).toContain('server.requestTimeout = 30_000');
    expect(source).toContain('server.headersTimeout = 15_000');
  });

  it.runIf(process.platform !== 'win32')(
    'rejects pre-existing topic, sessions, and session file symlink escapes',
    async () => {
      const created = await seededSession();
      const external = path.join(root, 'external');
      await fs.mkdir(external);
      const movedTopic = path.join(root, 'moved-topic');
      await fs.rename(topicDir, movedTopic);
      await fs.symlink(movedTopic, topicDir);
      expect((await request('/api/topics/typescript/sessions')).status).toBe(403);
      await fs.unlink(topicDir);
      await fs.rename(movedTopic, topicDir);

      const movedSessions = path.join(external, 'sessions');
      await fs.rename(path.join(topicDir, 'sessions'), movedSessions);
      await fs.symlink(movedSessions, path.join(topicDir, 'sessions'));
      expect((await request('/api/topics/typescript/sessions')).status).toBe(403);
      await fs.unlink(path.join(topicDir, 'sessions'));
      await fs.rename(movedSessions, path.join(topicDir, 'sessions'));

      const sessionDir = path.join(topicDir, 'sessions', created.session.id);
      const movedSessionDir = path.join(external, created.session.id);
      await fs.rename(sessionDir, movedSessionDir);
      await fs.symlink(movedSessionDir, sessionDir);
      expect((await request(`/api/topics/typescript/sessions/${created.session.id}`)).status).toBe(
        403,
      );
      await fs.unlink(sessionDir);
      await fs.rename(movedSessionDir, sessionDir);

      const sessionPath = path.join(sessionDir, 'session.json');
      const movedSession = path.join(external, 'session.json');
      await fs.rename(sessionPath, movedSession);
      await fs.symlink(movedSession, sessionPath);
      expect((await request(`/api/topics/typescript/sessions/${created.session.id}`)).status).toBe(
        403,
      );
    },
  );
});
