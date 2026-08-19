import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  initializeLearnConfig,
  learnConfigStore,
  updateLearnConfig,
} from '../../src/core/learn-config.js';
import { defaultLearnConfig } from '../../src/core/learn-config.js';
import { StateConflictError, StateCorruptionError } from '../../src/core/state-store/index.js';

const dirs: string[] = [];
async function temp() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-config-'));
  dirs.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('learn config', () => {
  it('creates deterministic defaults when supplied a timezone', () => {
    expect(defaultLearnConfig('es', 'America/Argentina/Buenos_Aires')).toEqual({
      version: 1,
      locale: 'es',
      timezone: 'America/Argentina/Buenos_Aires',
      numbering: 'hierarchical',
    });
  });
  it('creates once, preserves settings, updates only explicit locale, and enforces CAS', async () => {
    const dir = await temp();
    const first = await initializeLearnConfig(dir, 'es');
    expect(first.state).toMatchObject({ version: 1, locale: 'es', numbering: 'hierarchical' });
    const same = await initializeLearnConfig(dir);
    expect(same).toEqual(first);
    const changed = await initializeLearnConfig(dir, 'zh-CN');
    expect(changed.state).toEqual({ ...first.state, locale: 'zh-CN' });
    await expect(updateLearnConfig(dir, first.revision, changed.state)).rejects.toBeInstanceOf(
      StateConflictError,
    );
  });

  it('fails closed for invalid existing locale and timezone', async () => {
    const dir = await temp();
    await fs.writeFile(
      path.join(dir, 'config.json'),
      JSON.stringify({ version: 1, locale: 'fr', timezone: 'UTC', numbering: 'hierarchical' }),
    );
    await expect(initializeLearnConfig(dir)).rejects.toBeInstanceOf(StateCorruptionError);
    await fs.writeFile(
      path.join(dir, 'config.json'),
      JSON.stringify({
        version: 1,
        locale: 'en',
        timezone: 'Not/AZone',
        numbering: 'hierarchical',
      }),
    );
    await expect(learnConfigStore(dir).read()).rejects.toBeInstanceOf(StateCorruptionError);
  });
});
