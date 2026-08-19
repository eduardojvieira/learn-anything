import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import {
  IdempotencyConflictError,
  LearnctlPayloadError,
  listSessions,
  recordAssessment,
  sessionSnapshot,
  snapshot,
  UnknownConceptError,
  UnknownQuestionError,
  UnknownSessionError,
  SessionTimestampError,
  SessionTopicMismatchError,
  updateSocraticResponse,
} from './learnctl/index.js';
import {
  StateConflictError,
  StateCorruptionError,
  StateLockTimeoutError,
  StateRecoveryError,
} from './core/state-store/index.js';
import { ReviewOutOfOrderError } from './core/learning-engine/index.js';
import {
  learnConfigSchema,
  loadOrInitializeLearnConfig,
  learnConfigStore,
} from './core/learn-config.js';

const MAX_BODY_BYTES = 64 * 1024;
const REVISION = /^[a-f0-9]{64}$/;

type Json = Record<string, unknown>;

export function resolveTopicDir(topicsDir: string, encodedSlug: string): string | undefined {
  let slug: string;
  try {
    slug = decodeURIComponent(encodedSlug);
  } catch {
    return undefined;
  }
  if (!slug || slug === '.' || slug === '..' || /[\\/\0]/.test(slug)) return undefined;
  const root = path.resolve(topicsDir);
  const topicDir = path.resolve(root, slug);
  return path.dirname(topicDir) === root ? topicDir : undefined;
}

export class UnsafeCanonicalPathError extends Error {
  constructor() {
    super('Unsafe canonical path');
    this.name = 'UnsafeCanonicalPathError';
  }
}

function isCanonicalTopic(topicDir: string, topicsDir: string): boolean {
  try {
    const root = realpathSync.native(topicsDir);
    if (path.dirname(realpathSync.native(topicDir)) !== root) return false;
    for (const name of [
      'state.json',
      '.state.json.tmp',
      '.state.json.journal',
      '.state.json.journal.tmp',
      '.state.json.lock',
      'sessions',
    ]) {
      const target = path.join(topicDir, name);
      if (existsSync(target) && lstatSync(target).isSymbolicLink()) return false;
    }
    const sessionsDir = path.join(topicDir, 'sessions');
    if (!existsSync(sessionsDir)) return true;
    for (const entry of readdirSync(sessionsDir, { withFileTypes: true })) {
      if (!/^[0-9a-f-]{36}$/i.test(entry.name)) continue;
      const sessionDir = path.join(sessionsDir, entry.name);
      if (lstatSync(sessionDir).isSymbolicLink()) return false;
      for (const name of readdirSync(sessionDir)) {
        if (name === 'session.json' || name.startsWith('.session.json.')) {
          if (lstatSync(path.join(sessionDir, name)).isSymbolicLink()) return false;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}

export function assertCanonicalTopic(topicDir: string, topicsDir: string): void {
  if (!isCanonicalTopic(topicDir, topicsDir)) throw new UnsafeCanonicalPathError();
}

export async function handleDashboardApi(
  req: IncomingMessage,
  res: ServerResponse,
  topicsDir: string,
  pathname: string,
): Promise<boolean> {
  if (pathname === '/api/config') return handleConfigApi(req, res, path.dirname(topicsDir));
  const match = pathname.match(
    /^\/api\/topics\/([^/]+)(?:\/sessions(?:\/([^/]+)(?:\/socratic\/([^/]+))?)?|\/assessments)?$/,
  );
  if (!match) return false;
  const [, encodedSlug, sessionId, questionId] = match;
  const topicDir = resolveTopicDir(topicsDir, encodedSlug);
  if (!topicDir) return send(res, 404, { error: 'not_found' });
  if (!existsSync(topicDir)) return send(res, 404, { error: 'not_found' });
  try {
    assertCanonicalTopic(topicDir, topicsDir);
  } catch (error) {
    return respondDashboardError(res, error);
  }
  try {
    if (!pathname.includes('/sessions') && !pathname.endsWith('/assessments')) return false;
    if (pathname.endsWith('/sessions')) {
      if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
      return send(
        res,
        200,
        { sessions: await listSessions(topicDir) },
        { 'Cache-Control': 'no-store' },
      );
    }
    if (sessionId && !questionId) {
      if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
      const current = await sessionSnapshot(topicDir, decodeSegment(sessionId));
      return send(res, 200, current, { ETag: etag(current.revision), 'Cache-Control': 'no-store' });
    }
    if (sessionId && questionId) {
      if (req.method !== 'PUT') return methodNotAllowed(res, 'PUT');
      const request = await writeRequest(req, res);
      if (!request) return true;
      rejectReserved(request.body, [
        'expected_revision',
        'idempotency_key',
        'question_id',
        'session_id',
        'topic_id',
      ]);
      const updated = await updateSocraticResponse(topicDir, decodeSegment(sessionId), {
        ...request.body,
        question_id: decodeSegment(questionId),
        expected_revision: request.revision,
        idempotency_key: request.idempotencyKey,
      });
      return send(
        res,
        200,
        { session: updated.session, revision: updated.revision },
        { ETag: etag(updated.revision), 'Cache-Control': 'no-store' },
      );
    }
    if (pathname.endsWith('/assessments')) {
      if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
      const request = await writeRequest(req, res);
      if (!request) return true;
      rejectReserved(request.body, [
        'expected_revision',
        'idempotency_key',
        'mastery',
        'status',
        'topic_id',
      ]);
      const updated = await recordAssessment(topicDir, {
        ...request.body,
        expected_revision: request.revision,
        idempotency_key: request.idempotencyKey,
      });
      return send(
        res,
        200,
        { revision: updated.revision, mastery: updated.mastery },
        { ETag: etag(updated.revision), 'Cache-Control': 'no-store' },
      );
    }
    return false;
  } catch (error) {
    return respondDashboardError(res, error);
  }
}

async function handleConfigApi(
  req: IncomingMessage,
  res: ServerResponse,
  learnDir: string,
): Promise<boolean> {
  const store = learnConfigStore(learnDir);
  try {
    if (!isCanonicalConfig(learnDir)) throw new UnsafeCanonicalPathError();
    if (req.method === 'GET') {
      const current = await loadOrInitializeLearnConfig(learnDir);
      return send(
        res,
        200,
        { config: current.state, revision: current.revision },
        { ETag: etag(current.revision), 'Cache-Control': 'no-store' },
      );
    }
    if (req.method !== 'PUT') return methodNotAllowed(res, 'GET, PUT');
    const request = await configWriteRequest(req, res);
    if (!request) return true;
    const parsed = learnConfigSchema.safeParse(request.body);
    if (!parsed.success) return send(res, 400, { error: 'invalid_request' });
    try {
      const updated = await store.transact(request.revision, () => parsed.data);
      return send(
        res,
        200,
        { config: updated.state, revision: updated.revision },
        { ETag: etag(updated.revision), 'Cache-Control': 'no-store' },
      );
    } catch (error) {
      if (error instanceof StateConflictError) {
        const current = await store.read();
        if (JSON.stringify(current.state) === JSON.stringify(parsed.data))
          return send(
            res,
            200,
            { config: current.state, revision: current.revision },
            { ETag: etag(current.revision), 'Cache-Control': 'no-store' },
          );
        throw error;
      }
      throw error;
    }
  } catch (error) {
    return respondDashboardError(res, error);
  }
}

export async function v2TopicSnapshot(topicDir: string) {
  return snapshot(topicDir);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new LearnctlPayloadError();
  }
}

async function writeRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<{ body: Json; revision: string; idempotencyKey: string } | undefined> {
  const host = req.headers.host;
  if (!host || req.headers.origin !== `http://${host}`) {
    send(res, 403, { error: 'forbidden' });
    return;
  }
  const contentType =
    typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : '';
  if (!/^application\/json(?:\s*;.*)?$/i.test(contentType)) {
    send(res, 415, { error: 'unsupported_media_type' });
    return;
  }
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    send(res, 413, { error: 'payload_too_large' }, { Connection: 'close' });
    req.destroy();
    return;
  }
  const ifMatch = typeof req.headers['if-match'] === 'string' ? req.headers['if-match'] : undefined;
  const match = ifMatch?.match(/^"([a-f0-9]{64})"$/);
  if (req.headers['if-match'] === undefined) {
    send(res, 428, { error: 'precondition_required' });
    return;
  }
  if (!match || !REVISION.test(match[1])) {
    send(res, 400, { error: 'invalid_if_match' });
    return;
  }
  const idempotencyHeader = req.headers['idempotency-key'];
  const idempotencyKey = typeof idempotencyHeader === 'string' ? idempotencyHeader : undefined;
  if (!idempotencyKey || !idempotencyKey.trim() || idempotencyKey.length > 200) {
    send(res, 400, { error: 'invalid_idempotency_key' });
    return;
  }
  const body = await readJson(req, res);
  return body ? { body, revision: match[1], idempotencyKey } : undefined;
}

async function configWriteRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<{ body: Json; revision: string } | undefined> {
  const host = req.headers.host;
  if (!host || req.headers.origin !== `http://${host}`) {
    send(res, 403, { error: 'forbidden' });
    return;
  }
  const contentType =
    typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : '';
  if (!/^application\/json(?:\s*;.*)?$/i.test(contentType)) {
    send(res, 415, { error: 'unsupported_media_type' });
    return;
  }
  const contentLength = Number(req.headers['content-length']);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    send(res, 413, { error: 'payload_too_large' }, { Connection: 'close' });
    req.destroy();
    return;
  }
  const ifMatch = typeof req.headers['if-match'] === 'string' ? req.headers['if-match'] : undefined;
  const match = ifMatch?.match(/^"([a-f0-9]{64})"$/);
  if (req.headers['if-match'] === undefined) {
    send(res, 428, { error: 'precondition_required' });
    return;
  }
  if (!match || !REVISION.test(match[1])) {
    send(res, 400, { error: 'invalid_if_match' });
    return;
  }
  const body = await readJson(req, res);
  return body ? { body, revision: match[1] } : undefined;
}

function isCanonicalConfig(learnDir: string): boolean {
  try {
    if (existsSync(learnDir) && lstatSync(learnDir).isSymbolicLink()) return false;
    for (const name of [
      'config.json',
      '.config.json.tmp',
      '.config.json.journal',
      '.config.json.journal.tmp',
      '.config.json.lock',
    ]) {
      const target = path.join(learnDir, name);
      if (existsSync(target) && lstatSync(target).isSymbolicLink()) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function readJson(req: IncomingMessage, res: ServerResponse): Promise<Json | undefined> {
  let bytes = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += value.length;
    if (bytes > MAX_BODY_BYTES) {
      send(res, 413, { error: 'payload_too_large' }, { Connection: 'close' });
      req.destroy();
      return;
    }
    chunks.push(value);
  }
  try {
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error();
    return body as Json;
  } catch {
    send(res, 400, { error: 'invalid_json' });
    return;
  }
}

function rejectReserved(body: Json, fields: string[]): void {
  if (fields.some((field) => Object.hasOwn(body, field))) throw new LearnctlPayloadError();
}

export function respondDashboardError(res: ServerResponse, error: unknown): true {
  if (error instanceof UnsafeCanonicalPathError) return send(res, 403, { error: 'forbidden' });
  if (error instanceof StateConflictError)
    return send(
      res,
      412,
      { error: 'revision_conflict', revision: error.actualRevision },
      { ETag: etag(error.actualRevision) },
    );
  if (
    error instanceof IdempotencyConflictError ||
    error instanceof SessionTimestampError ||
    error instanceof SessionTopicMismatchError ||
    error instanceof ReviewOutOfOrderError
  )
    return send(res, 409, { error: 'request_conflict' });
  if (error instanceof StateLockTimeoutError)
    return send(res, 503, { error: 'state_busy' }, { 'Retry-After': '1' });
  if (error instanceof StateCorruptionError || error instanceof StateRecoveryError)
    return send(res, 500, { error: 'state_unavailable' });
  if (
    error instanceof UnknownConceptError ||
    error instanceof UnknownSessionError ||
    error instanceof UnknownQuestionError
  )
    return send(res, 404, { error: 'not_found' });
  if (error instanceof LearnctlPayloadError || error instanceof URIError)
    return send(res, 400, { error: 'invalid_request' });
  return send(res, 500, { error: 'internal_error' });
}

function etag(revision: string): string {
  return `"${revision}"`;
}
function methodNotAllowed(res: ServerResponse, allow: string): true {
  return send(res, 405, { error: 'method_not_allowed' }, { Allow: allow });
}
function send(
  res: ServerResponse,
  status: number,
  data: unknown,
  headers: Record<string, string> = {},
): true {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(data));
  return true;
}
