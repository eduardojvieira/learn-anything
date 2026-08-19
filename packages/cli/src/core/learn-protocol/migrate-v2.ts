import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { StateStore } from '../state-store/index.js';
import { generateSlug } from './slug.js';
import { stateV1Schema, stateV2Schema } from './schema.js';
import type { Concept, StateV1, StateV2 } from './types.js';

const BACKUP_FILE = 'state.v1.json.bak';
const BACKUP_TEMP_FILE = '.state.v1.json.bak.tmp';

export class V1BackupMismatchError extends Error {
  constructor() {
    super('Existing state.v1.json.bak does not match state.json V1; migration refused');
    this.name = 'V1BackupMismatchError';
  }
}

export interface V2MigrationResult {
  migrated: boolean;
  topic: string;
  revision: string;
  reason?: 'already_v2';
}

export async function migrateV1ToV2(topicDir: string): Promise<V2MigrationResult> {
  const store = new StateStore<StateV1 | StateV2>(topicDir, { validate: validateKnownState });
  const current = await store.read();

  if (current.state.version === 2) {
    await cleanBackupTempIfLinked(topicDir);
    return {
      migrated: false,
      topic: current.state.topic,
      revision: current.revision,
      reason: 'already_v2',
    };
  }

  const next = await store.transact(current.revision, async (state) => {
    if (state.version !== 1)
      throw new Error('State changed to an unsupported version during migration');
    const v1 = validateV1(state);
    const migrated = convertV1ToV2(v1);
    const validated = stateV2Schema.safeParse(migrated);
    if (!validated.success) throw new Error('V1 state cannot be converted to a valid V2 state');
    await ensureV1Backup(topicDir, v1);
    return validated.data;
  });
  return { migrated: true, topic: next.state.topic, revision: next.revision };
}

function validateKnownState(state: StateV1 | StateV2): void {
  if (stateV2Schema.safeParse(state).success || stateV1Schema.safeParse(state).success) return;
  throw new Error('state.json is neither a valid V1 nor a valid V2 state');
}

function validateV1(state: StateV1): StateV1 {
  const result = stateV1Schema.safeParse(state);
  if (!result.success) throw new Error('state.json is not a valid V1 state');
  return state;
}

function convertV1ToV2(state: StateV1): StateV2 {
  const createdAt = normalizeV1Timestamp(state.created);
  const legacyDates = state.domains.flatMap((domain) =>
    domain.concepts.flatMap(
      (concept) => [concept.last_explained, concept.last_practiced].filter(Boolean) as string[],
    ),
  );
  const updatedAt = maxTimestamp(createdAt, ...legacyDates.map(normalizeV1Timestamp));

  return {
    version: 2,
    id: randomUUID(),
    topic: state.topic,
    slug: state.slug,
    created_at: createdAt,
    updated_at: updatedAt,
    domains: state.domains.map((domain) => ({
      id: randomUUID(),
      name: domain.name,
      slug: domain.slug,
      concepts: domain.concepts.map((concept) => convertConcept(concept, createdAt)),
    })),
  };
}

function convertConcept(
  concept: Concept,
  createdAt: string,
): StateV2['domains'][number]['concepts'][number] {
  const observedAt = maxTimestamp(
    createdAt,
    ...[concept.last_explained, concept.last_practiced]
      .filter(Boolean)
      .map((value) => normalizeV1Timestamp(value!)),
  );
  const hasLegacySignal =
    concept.status !== 'unexplored' ||
    concept.confidence > 0 ||
    concept.practice_count > 0 ||
    concept.explain_count > 0 ||
    concept.last_explained !== null ||
    concept.last_practiced !== null;

  return {
    id: randomUUID(),
    name: concept.name,
    slug: concept.slug,
    details: concept.details.map((detail) => ({
      id: randomUUID(),
      name: detail,
      slug: generateSlug(detail),
    })),
    prerequisites: [],
    relations: [],
    evidence: hasLegacySignal
      ? [
          {
            id: randomUUID(),
            kind:
              concept.practice_count > 0
                ? 'practice'
                : concept.explain_count > 0
                  ? 'self_explanation'
                  : 'diagnostic',
            observed_at: observedAt,
            score: concept.confidence,
            source: 'migration',
            predicted_score: null,
            review_rating: null,
            session_id: null,
            feedback: `status=${concept.status}; practice_count=${concept.practice_count}; explain_count=${concept.explain_count}`,
            corrected: false,
            delay_days: null,
          },
        ]
      : [],
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
  };
}

function normalizeV1Timestamp(value: string): string {
  return value.length === 10 ? `${value}T00:00:00.000Z` : `${value.replace(' ', 'T')}.000Z`;
}

function maxTimestamp(...timestamps: string[]): string {
  return timestamps.reduce((latest, value) =>
    Date.parse(value) > Date.parse(latest) ? value : latest,
  );
}

async function ensureV1Backup(topicDir: string, state: StateV1): Promise<void> {
  const backupPath = path.join(topicDir, BACKUP_FILE);
  const tempPath = path.join(topicDir, BACKUP_TEMP_FILE);
  if (await exists(backupPath)) {
    await verifyMatchingBackup(backupPath, state);
    await fs.rm(tempPath, { force: true });
    await syncDirectory(topicDir);
    return;
  }
  await durableWrite(tempPath, canonicalBytes(state));
  try {
    await fs.link(tempPath, backupPath);
  } catch (error) {
    if (!isAlreadyExists(error)) throw error;
    await verifyMatchingBackup(backupPath, state);
  }
  await syncDirectory(topicDir);
  await fs.rm(tempPath, { force: true });
  await syncDirectory(topicDir);
}

async function verifyMatchingBackup(backupPath: string, state: StateV1): Promise<void> {
  const backup = validateV1(JSON.parse(await fs.readFile(backupPath, 'utf8')) as StateV1);
  if (!isDeepStrictEqual(backup, state)) throw new V1BackupMismatchError();
}

async function cleanBackupTempIfLinked(topicDir: string): Promise<void> {
  const backupPath = path.join(topicDir, BACKUP_FILE);
  if (!(await exists(backupPath))) return;
  const text = await fs.readFile(backupPath, 'utf8');
  let backup: StateV1;
  try {
    backup = JSON.parse(text) as StateV1;
  } catch {
    return;
  }
  try {
    validateV1(backup);
  } catch {
    return;
  }
  await fs.rm(path.join(topicDir, BACKUP_TEMP_FILE), { force: true });
  await syncDirectory(topicDir);
}

async function durableWrite(temp: string, bytes: Buffer): Promise<void> {
  const handle = await fs.open(temp, 'w', 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
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

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

function isAlreadyExists(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'EEXIST'
  );
}

function isNotFound(error: unknown): error is NodeJS.ErrnoException {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}
