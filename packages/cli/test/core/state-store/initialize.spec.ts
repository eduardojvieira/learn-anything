import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  StateAlreadyExistsError,
  StateRecoveryError,
  StateStore,
} from '../../../src/core/state-store/index.js';

let topicDir: string;

beforeEach(async () => {
  topicDir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'learn-state-init-')), 'topic');
});

afterEach(async () => {
  await fs.rm(path.dirname(topicDir), { recursive: true, force: true });
});

describe('StateStore.initialize', () => {
  it('creates a canonical state exactly once', async () => {
    const store = new StateStore<{ count: number }>(topicDir);
    expect(await store.initialize({ count: 1 })).toMatchObject({ state: { count: 1 } });
    expect(await fs.readFile(path.join(topicDir, 'state.json'), 'utf8')).toBe(
      '{\n  "count": 1\n}\n',
    );
    await expect(store.initialize({ count: 2 })).rejects.toBeInstanceOf(StateAlreadyExistsError);
    expect(JSON.parse(await fs.readFile(path.join(topicDir, 'state.json'), 'utf8'))).toEqual({
      count: 1,
    });
  });

  it('cleans a strict orphan temporary file before retrying initialization', async () => {
    await fs.mkdir(topicDir, { recursive: true });
    await fs.writeFile(path.join(topicDir, '.state.json.tmp'), '{partial');
    const store = new StateStore<{ count: number }>(topicDir);

    await expect(store.initialize({ count: 1 })).resolves.toMatchObject({ state: { count: 1 } });
    await expect(fs.access(path.join(topicDir, '.state.json.tmp'))).rejects.toThrow();
  });

  it('finishes a pending journal before rejecting an already-published state', async () => {
    const oldState = { count: 1 };
    const newState = { count: 2 };
    await fs.mkdir(topicDir, { recursive: true });
    await fs.writeFile(path.join(topicDir, 'state.json'), `${JSON.stringify(oldState, null, 2)}\n`);
    await fs.writeFile(
      path.join(topicDir, '.state.json.tmp'),
      `${JSON.stringify(newState, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(topicDir, '.state.json.journal'),
      `${JSON.stringify({ version: 1, fromRevision: revision(oldState), toRevision: revision(newState), tempFile: '.state.json.tmp' })}\n`,
    );
    const store = new StateStore<{ count: number }>(topicDir);

    await expect(store.initialize({ count: 3 })).rejects.toBeInstanceOf(StateAlreadyExistsError);
    expect((await store.read()).state).toEqual(newState);
    await expect(fs.access(path.join(topicDir, '.state.json.journal'))).rejects.toThrow();
    await expect(fs.access(path.join(topicDir, '.state.json.tmp'))).rejects.toThrow();
  });

  it('preserves ambiguous journal artifacts when state.json is missing', async () => {
    await fs.mkdir(topicDir, { recursive: true });
    await fs.writeFile(path.join(topicDir, '.state.json.tmp'), '{"count":2}\n');
    await fs.writeFile(path.join(topicDir, '.state.json.journal'), '{"version":1}\n');

    await expect(
      new StateStore<{ count: number }>(topicDir).initialize({ count: 1 }),
    ).rejects.toBeInstanceOf(StateRecoveryError);
    await expect(fs.access(path.join(topicDir, '.state.json.journal'))).resolves.toBeUndefined();
    await expect(fs.access(path.join(topicDir, '.state.json.tmp'))).resolves.toBeUndefined();
  });
});

function revision(value: unknown): string {
  return createHash('sha256')
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest('hex');
}
