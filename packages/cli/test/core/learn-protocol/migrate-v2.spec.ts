import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deriveNumbering,
  migrateV1ToV2,
  stateV2Schema,
  V1BackupMismatchError,
} from '../../../src/core/learn-protocol/index.js';

let topicDir: string;

beforeEach(async () => {
  topicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-migrate-v2-'));
});

afterEach(async () => {
  await fs.rm(topicDir, { recursive: true, force: true });
});

function v1() {
  return {
    version: 1,
    topic: 'TypeScript',
    slug: 'typescript',
    created: '2026-01-01',
    domains: [
      {
        name: 'Basics',
        slug: 'basics',
        concepts: [
          {
            name: 'Types',
            slug: 'types',
            status: 'mastered',
            confidence: 0.8,
            practice_count: 2,
            explain_count: 1,
            last_explained: '2026-01-03 12:00:00',
            last_practiced: '2026-01-04',
            details: ['Unions'],
          },
          {
            name: 'Narrowing',
            slug: 'narrowing',
            status: 'unexplored',
            confidence: 0,
            practice_count: 0,
            explain_count: 0,
            last_explained: null,
            last_practiced: null,
            details: [],
          },
        ],
      },
    ],
  };
}

async function writeState(value: unknown): Promise<void> {
  await fs.writeFile(path.join(topicDir, 'state.json'), `${JSON.stringify(value, null, 2)}\n`);
}

const revision = (value: unknown) =>
  createHash('sha256')
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest('hex');

describe('migrateV1ToV2', () => {
  it('migrates valid V1, makes a durable semantic backup, and preserves hierarchy identity', async () => {
    const source = v1();
    await writeState(source);

    const result = await migrateV1ToV2(topicDir);
    const migrated = JSON.parse(await fs.readFile(path.join(topicDir, 'state.json'), 'utf8'));
    const backup = JSON.parse(await fs.readFile(path.join(topicDir, 'state.v1.json.bak'), 'utf8'));

    expect(result).toMatchObject({ migrated: true, topic: 'TypeScript' });
    expect(stateV2Schema.safeParse(migrated).success).toBe(true);
    expect(backup).toEqual(source);
    expect(migrated.domains[0]).toMatchObject({ name: 'Basics', slug: 'basics' });
    expect(migrated.domains[0].concepts[0]).toMatchObject({ name: 'Types', slug: 'types' });
    expect(migrated.domains[0].concepts[0].details[0]).toMatchObject({
      name: 'Unions',
      slug: 'unions',
    });
    expect(migrated.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(migrated.domains[0].concepts[0].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(deriveNumbering(migrated)).toMatchObject({
      [migrated.domains[0].id]: '1',
      [migrated.domains[0].concepts[0].id]: '1.1',
      [migrated.domains[0].concepts[0].details[0].id]: '1.1.1',
    });
  });

  it('maps legacy signals to one evidence record and deterministic UTC timestamps', async () => {
    await writeState(v1());
    await migrateV1ToV2(topicDir);
    const migrated = JSON.parse(await fs.readFile(path.join(topicDir, 'state.json'), 'utf8'));
    const concept = migrated.domains[0].concepts[0];

    expect(migrated.created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(migrated.updated_at).toBe('2026-01-04T00:00:00.000Z');
    expect(concept.evidence).toHaveLength(1);
    expect(concept.evidence[0]).toMatchObject({
      kind: 'practice',
      observed_at: '2026-01-04T00:00:00.000Z',
      score: 0.8,
      source: 'migration',
      predicted_score: null,
      review_rating: null,
      session_id: null,
      corrected: false,
      delay_days: null,
    });
    expect(concept.evidence[0].feedback).toContain('mastered');
    expect(concept.evidence[0].feedback).toContain('2');
    expect(concept.evidence[0].feedback).toContain('1');
    expect(migrated.domains[0].concepts[1].evidence).toEqual([]);
    expect(concept.calibration).toEqual({
      predicted_score: null,
      observed_score: null,
      samples: 0,
      updated_at: null,
    });
    expect(concept.review).toMatchObject({ state: 'new', reps: 0, lapses: 0, learning_steps: 0 });
  });

  it('is byte- and revision-idempotent and never overwrites a V1 backup', async () => {
    await writeState(v1());
    const first = await migrateV1ToV2(topicDir);
    const firstBytes = await fs.readFile(path.join(topicDir, 'state.json'));
    const firstBackup = await fs.readFile(path.join(topicDir, 'state.v1.json.bak'));
    const second = await migrateV1ToV2(topicDir);

    expect(second).toEqual({
      migrated: false,
      topic: 'TypeScript',
      revision: first.revision,
      reason: 'already_v2',
    });
    expect(await fs.readFile(path.join(topicDir, 'state.json')).then(String)).toBe(
      String(firstBytes),
    );
    expect(await fs.readFile(path.join(topicDir, 'state.v1.json.bak')).then(String)).toBe(
      String(firstBackup),
    );
  });

  it('keeps a matching pre-existing backup and removes its reserved orphan temp', async () => {
    const source = v1();
    await writeState(source);
    const backupPath = path.join(topicDir, 'state.v1.json.bak');
    await fs.writeFile(backupPath, `${JSON.stringify(source, null, 2)}\n`);
    await fs.writeFile(path.join(topicDir, '.state.v1.json.bak.tmp'), 'orphan');
    const before = await fs.readFile(backupPath);

    await migrateV1ToV2(topicDir);

    expect(await fs.readFile(backupPath).then(String)).toBe(String(before));
    await expect(fs.access(path.join(topicDir, '.state.v1.json.bak.tmp'))).rejects.toThrow();
  });

  it('leaves an existing valid V2 byte-for-byte unchanged', async () => {
    await writeState(v1());
    await migrateV1ToV2(topicDir);
    const before = await fs.readFile(path.join(topicDir, 'state.json'));
    await fs.writeFile(path.join(topicDir, '.state.v1.json.bak.tmp'), 'linked-before-crash');
    const result = await migrateV1ToV2(topicDir);
    expect(result.reason).toBe('already_v2');
    expect(await fs.readFile(path.join(topicDir, 'state.json')).then(String)).toBe(String(before));
    await expect(fs.access(path.join(topicDir, '.state.v1.json.bak.tmp'))).rejects.toThrow();
  });

  it('rejects corrupt or unrecognized state without writing', async () => {
    await fs.writeFile(path.join(topicDir, 'state.json'), '{broken');
    await expect(migrateV1ToV2(topicDir)).rejects.toThrow();
    expect(await fs.readFile(path.join(topicDir, 'state.json'), 'utf8')).toBe('{broken');
    await expect(fs.access(path.join(topicDir, 'state.v1.json.bak'))).rejects.toThrow();

    await writeState({ version: 3, topic: 'Unknown' });
    const before = await fs.readFile(path.join(topicDir, 'state.json'));
    await expect(migrateV1ToV2(topicDir)).rejects.toThrow();
    expect(await fs.readFile(path.join(topicDir, 'state.json')).then(String)).toBe(String(before));
  });

  it('rejects a divergent existing V1 backup without changing state', async () => {
    const source = v1();
    await writeState(source);
    await fs.writeFile(
      path.join(topicDir, 'state.v1.json.bak'),
      `${JSON.stringify({ ...source, topic: 'Other' }, null, 2)}\n`,
    );
    const before = await fs.readFile(path.join(topicDir, 'state.json'));

    await expect(migrateV1ToV2(topicDir)).rejects.toBeInstanceOf(V1BackupMismatchError);
    expect(await fs.readFile(path.join(topicDir, 'state.json')).then(String)).toBe(String(before));
  });

  it('recovers a pending StateStore journal before deciding what to migrate', async () => {
    const original = v1();
    const recovered = { ...v1(), topic: 'Recovered', slug: 'recovered' };
    await writeState(original);
    await fs.writeFile(
      path.join(topicDir, '.state.json.tmp'),
      `${JSON.stringify(recovered, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(topicDir, '.state.json.journal'),
      `${JSON.stringify({ version: 1, fromRevision: revision(original), toRevision: revision(recovered), tempFile: '.state.json.tmp' })}\n`,
    );

    const result = await migrateV1ToV2(topicDir);
    expect(result).toMatchObject({ migrated: true, topic: 'Recovered' });
    expect(
      JSON.parse(await fs.readFile(path.join(topicDir, 'state.v1.json.bak'), 'utf8')).topic,
    ).toBe('Recovered');
  });
});
