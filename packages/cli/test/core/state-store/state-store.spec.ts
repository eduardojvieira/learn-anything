import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  StateConflictError,
  StateCorruptionError,
  StateLockTimeoutError,
  StateRecoveryError,
  StateStore,
  StateValidationError,
} from '../../../src/core/state-store/index.js';

let topicDir: string;

const revision = (value: unknown) =>
  createHash('sha256')
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest('hex');

beforeEach(async () => {
  topicDir = await fs.mkdtemp(path.join(os.tmpdir(), 'learn-state-store-'));
});

afterEach(async () => {
  await fs.rm(topicDir, { recursive: true, force: true });
});

async function writeState(value: unknown): Promise<void> {
  await fs.writeFile(path.join(topicDir, 'state.json'), `${JSON.stringify(value, null, 2)}\n`);
}

async function currentLinuxIdentity(): Promise<string> {
  const [bootId, stat] = await Promise.all([
    fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
    fs.readFile(`/proc/${process.pid}/stat`, 'utf8'),
  ]);
  return `${bootId.trim()}:${
    stat
      .slice(stat.lastIndexOf(')') + 2)
      .trim()
      .split(/\s+/)[19]
  }`;
}

describe('StateStore', () => {
  it('uses configured session filenames without changing the default state naming', async () => {
    const store = new StateStore<{ count: number }>(topicDir, { fileName: 'session.json' });
    await store.initialize({ count: 1 });

    expect(await fs.readFile(path.join(topicDir, 'session.json'), 'utf8')).toBe(
      '{\n  "count": 1\n}\n',
    );
    await expect(fs.access(path.join(topicDir, 'state.json'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    const before = await store.read();
    await store.transact(before.revision, (state) => ({ count: state.count + 1 }));
    expect(await fs.readFile(path.join(topicDir, 'session.json'), 'utf8')).toBe(
      '{\n  "count": 2\n}\n',
    );
  });

  it('round-trips canonical JSON and returns a content revision', async () => {
    await writeState({ count: 1 });
    const store = new StateStore<{ count: number }>(topicDir);

    const before = await store.read();
    expect(before).toEqual({ state: { count: 1 }, revision: revision({ count: 1 }) });

    const after = await store.transact(before.revision, (state) => ({ count: state.count + 1 }));
    expect(after).toEqual({ state: { count: 2 }, revision: revision({ count: 2 }) });
    expect(await fs.readFile(path.join(topicDir, 'state.json'), 'utf8')).toBe(
      '{\n  "count": 2\n}\n',
    );
  });

  it('rejects a stale compare-and-swap revision', async () => {
    await writeState({ count: 1 });
    const store = new StateStore<{ count: number }>(topicDir);
    const snapshot = await store.read();
    await store.transact(snapshot.revision, (state) => ({ count: state.count + 1 }));

    await expect(store.transact(snapshot.revision, (state) => state)).rejects.toBeInstanceOf(
      StateConflictError,
    );
  });

  it('does not write when the mutator throws, even if it changed its input', async () => {
    await writeState({ count: 1 });
    const store = new StateStore<{ count: number }>(topicDir);
    const snapshot = await store.read();

    await expect(
      store.transact(snapshot.revision, (state) => {
        state.count = 2;
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');
    expect(await store.read()).toEqual(snapshot);
  });

  it('serializes concurrent transactions without losing an update', async () => {
    await writeState({ count: 0 });
    const store = new StateStore<{ count: number }>(topicDir, { lockTimeoutMs: 1_000 });
    const snapshot = await store.read();

    let entered!: () => void;
    const firstEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const first = store.transact(snapshot.revision, async (state) => {
      entered();
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { count: state.count + 1 };
    });
    await firstEntered;
    const second = store.transact(snapshot.revision, (state) => ({ count: state.count + 1 }));

    await expect(first).resolves.toMatchObject({ state: { count: 1 } });
    await expect(second).rejects.toBeInstanceOf(StateConflictError);
    expect((await store.read()).state).toEqual({ count: 1 });
  });

  it('times out on a live directory lock without changing its owner', async () => {
    await writeState({ count: 0 });
    const lock = path.join(topicDir, '.state.json.lock');
    const owner = JSON.stringify({
      version: 1,
      pid: process.pid,
      token: '00000000-0000-4000-8000-000000000001',
    });
    await fs.mkdir(lock);
    await fs.writeFile(path.join(lock, 'owner.json'), owner);
    const store = new StateStore<{ count: number }>(topicDir, { lockTimeoutMs: 20 });

    await expect(store.read()).rejects.toBeInstanceOf(StateLockTimeoutError);
    expect(await fs.readFile(path.join(lock, 'owner.json'), 'utf8')).toBe(owner);
  });

  it('reclaims a dead owner directory lock and recovers a partial replacement as a rollback', async () => {
    const from = { count: 1 };
    const to = { count: 2 };
    await writeState(from);
    const lock = path.join(topicDir, '.state.json.lock');
    await fs.mkdir(lock);
    await fs.writeFile(
      path.join(lock, 'owner.json'),
      JSON.stringify({
        version: 1,
        pid: 2_147_483_647,
        token: '00000000-0000-4000-8000-000000000001',
      }),
    );
    await fs.writeFile(path.join(topicDir, '.state.json.tmp'), '{');
    await fs.writeFile(
      path.join(topicDir, '.state.json.journal'),
      JSON.stringify({
        version: 1,
        fromRevision: revision(from),
        toRevision: revision(to),
        tempFile: '.state.json.tmp',
      }),
    );

    const store = new StateStore<{ count: number }>(topicDir);
    await expect(store.read()).resolves.toEqual({ state: from, revision: revision(from) });
    await expect(fs.access(lock)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(fs.access(path.join(topicDir, '.state.json.journal'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it.runIf(process.platform === 'linux')(
    'reclaims a reused live PID only when its fingerprint differs',
    async () => {
      await writeState({ count: 1 });
      const lock = path.join(topicDir, '.state.json.lock');
      await fs.mkdir(lock);
      await fs.writeFile(
        path.join(lock, 'owner.json'),
        JSON.stringify({
          version: 2,
          pid: process.pid,
          token: '00000000-0000-4000-8000-000000000001',
          instance: '00000000-0000-4000-8000-000000000000:0',
        }),
      );
      await expect(new StateStore<{ count: number }>(topicDir).read()).resolves.toMatchObject({
        state: { count: 1 },
      });
      await expect(fs.access(lock)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it.runIf(process.platform === 'linux')(
    'preserves a live v2 owner whose fingerprint matches',
    async () => {
      await writeState({ count: 1 });
      const lock = path.join(topicDir, '.state.json.lock');
      const owner = JSON.stringify({
        version: 2,
        pid: process.pid,
        token: '00000000-0000-4000-8000-000000000001',
        instance: await currentLinuxIdentity(),
      });
      await fs.mkdir(lock);
      await fs.writeFile(path.join(lock, 'owner.json'), owner);
      const before = await fs.readFile(path.join(topicDir, 'state.json'));
      await expect(
        new StateStore<{ count: number }>(topicDir, { lockTimeoutMs: 20 }).read(),
      ).rejects.toBeInstanceOf(StateLockTimeoutError);
      expect(await fs.readFile(path.join(lock, 'owner.json'), 'utf8')).toBe(owner);
      expect(await fs.readFile(path.join(topicDir, 'state.json'))).toEqual(before);
    },
  );

  it('preserves journal and temp when reading a pending temp has an I/O failure', async () => {
    const from = { count: 1 };
    const to = { count: 2 };
    await writeState(from);
    const temp = path.join(topicDir, '.state.json.tmp');
    const journal = path.join(topicDir, '.state.json.journal');
    await fs.writeFile(temp, `${JSON.stringify(to, null, 2)}\n`);
    await fs.writeFile(
      journal,
      JSON.stringify({
        version: 1,
        fromRevision: revision(from),
        toRevision: revision(to),
        tempFile: '.state.json.tmp',
      }),
    );
    const tempBytes = await fs.readFile(temp);
    const journalBytes = await fs.readFile(journal);
    const stateBytes = await fs.readFile(path.join(topicDir, 'state.json'));
    const original = fs.readFile.bind(fs);
    const spy = vi.spyOn(fs, 'readFile').mockImplementation(async (target, options) => {
      if (String(target) === temp) throw Object.assign(new Error('I/O'), { code: 'EIO' });
      return original(target, options as never);
    });
    try {
      await expect(new StateStore<{ count: number }>(topicDir).read()).rejects.toBeInstanceOf(
        StateCorruptionError,
      );
    } finally {
      spy.mockRestore();
    }
    expect(await fs.readFile(temp)).toEqual(tempBytes);
    expect(await fs.readFile(journal)).toEqual(journalBytes);
    expect(await fs.readFile(path.join(topicDir, 'state.json'))).toEqual(stateBytes);
  });

  it('recovers session files without touching a state.json sentinel', async () => {
    const from = { count: 1 };
    const to = { count: 2 };
    await writeState({ sentinel: true });
    const sentinel = await fs.readFile(path.join(topicDir, 'state.json'));
    await fs.writeFile(path.join(topicDir, 'session.json'), `${JSON.stringify(from, null, 2)}\n`);
    await fs.writeFile(
      path.join(topicDir, '.session.json.tmp'),
      `${JSON.stringify(to, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(topicDir, '.session.json.journal'),
      `${JSON.stringify({ version: 1, fromRevision: revision(from), toRevision: revision(to), tempFile: '.session.json.tmp' })}\n`,
    );

    await expect(
      new StateStore<{ count: number }>(topicDir, { fileName: 'session.json' }).read(),
    ).resolves.toEqual({ state: to, revision: revision(to) });
    expect(await fs.readFile(path.join(topicDir, 'state.json'))).toEqual(sentinel);
  });

  it('rejects lossy JSON values without creating or changing state', async () => {
    const values = [
      Number.NaN,
      Infinity,
      new Date('2026-01-01T00:00:00.000Z'),
      { missing: undefined },
      -0,
    ];
    for (const value of values) {
      const store = new StateStore<{ value: unknown }>(topicDir);
      await expect(store.initialize({ value })).rejects.toBeInstanceOf(StateValidationError);
      await expect(fs.access(path.join(topicDir, 'state.json'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    }
    await writeState({ value: 'safe' });
    const store = new StateStore<{ value: unknown }>(topicDir);
    const before = await store.read();
    const bytes = await fs.readFile(path.join(topicDir, 'state.json'));
    await expect(store.transact(before.revision, () => ({ value: -0 }))).rejects.toBeInstanceOf(
      StateValidationError,
    );
    expect(await store.read()).toEqual(before);
    expect(await fs.readFile(path.join(topicDir, 'state.json'))).toEqual(bytes);
  });

  it('recovers a durable journal and temporary replacement deterministically', async () => {
    const from = { count: 1 };
    const to = { count: 2 };
    await writeState(from);
    await fs.writeFile(path.join(topicDir, '.state.json.tmp'), `${JSON.stringify(to, null, 2)}\n`);
    await fs.writeFile(
      path.join(topicDir, '.state.json.journal'),
      `${JSON.stringify({ version: 1, fromRevision: revision(from), toRevision: revision(to), tempFile: '.state.json.tmp' })}\n`,
    );

    const snapshot = await new StateStore<{ count: number }>(topicDir).read();
    expect(snapshot).toEqual({ state: to, revision: revision(to) });
    await expect(fs.access(path.join(topicDir, '.state.json.journal'))).rejects.toThrow();
    await expect(fs.access(path.join(topicDir, '.state.json.tmp'))).rejects.toThrow();
  });

  it('cleans recovery artifacts when the replacement was already installed', async () => {
    const from = { count: 1 };
    const to = { count: 2 };
    await writeState(to);
    await fs.writeFile(path.join(topicDir, '.state.json.tmp'), `${JSON.stringify(to, null, 2)}\n`);
    await fs.writeFile(
      path.join(topicDir, '.state.json.journal'),
      `${JSON.stringify({ version: 1, fromRevision: revision(from), toRevision: revision(to), tempFile: '.state.json.tmp' })}\n`,
    );

    expect(await new StateStore<{ count: number }>(topicDir).read()).toEqual({
      state: to,
      revision: revision(to),
    });
    await expect(fs.access(path.join(topicDir, '.state.json.journal'))).rejects.toThrow();
    await expect(fs.access(path.join(topicDir, '.state.json.tmp'))).rejects.toThrow();
  });

  it('rolls back a current from revision when its temporary replacement has the wrong revision', async () => {
    const from = { count: 1 };
    const to = { count: 2 };
    await writeState(from);
    await fs.writeFile(
      path.join(topicDir, '.state.json.tmp'),
      `${JSON.stringify({ count: 3 }, null, 2)}\n`,
    );
    await fs.writeFile(
      path.join(topicDir, '.state.json.journal'),
      `${JSON.stringify({ version: 1, fromRevision: revision(from), toRevision: revision(to), tempFile: '.state.json.tmp' })}\n`,
    );

    await expect(new StateStore<{ count: number }>(topicDir).read()).resolves.toEqual({
      state: from,
      revision: revision(from),
    });
    await expect(fs.access(path.join(topicDir, '.state.json.tmp'))).rejects.toThrow();
    await expect(fs.access(path.join(topicDir, '.state.json.journal'))).rejects.toThrow();
  });

  it('keeps malformed dead lock owners contained in the lock directory', async () => {
    await writeState({ count: 0 });
    const lock = path.join(topicDir, '.state.json.lock');
    const owner = JSON.stringify({ version: 1, pid: 2_147_483_647, token: '../../escape' });
    await fs.mkdir(lock);
    await fs.writeFile(path.join(lock, 'owner.json'), owner);
    const before = await fs.readdir(topicDir);

    await expect(
      new StateStore<{ count: number }>(topicDir, { lockTimeoutMs: 20 }).read(),
    ).rejects.toBeInstanceOf(StateLockTimeoutError);
    expect(await fs.readFile(path.join(lock, 'owner.json'), 'utf8')).toBe(owner);
    expect((await fs.readdir(topicDir)).sort()).toEqual(before.sort());
  });

  it('preserves a divergent target during recovery', async () => {
    const from = { count: 1 };
    const to = { count: 2 };
    const divergent = { count: 3 };
    await writeState(divergent);
    await fs.writeFile(path.join(topicDir, '.state.json.tmp'), `${JSON.stringify(to, null, 2)}\n`);
    await fs.writeFile(
      path.join(topicDir, '.state.json.journal'),
      `${JSON.stringify({ version: 1, fromRevision: revision(from), toRevision: revision(to), tempFile: '.state.json.tmp' })}\n`,
    );

    await expect(new StateStore<{ count: number }>(topicDir).read()).rejects.toBeInstanceOf(
      StateRecoveryError,
    );
    expect(JSON.parse(await fs.readFile(path.join(topicDir, 'state.json'), 'utf8'))).toEqual(
      divergent,
    );
  });

  it('rejects corrupt JSON before exposing it', async () => {
    await fs.writeFile(path.join(topicDir, 'state.json'), '{broken');
    await expect(new StateStore(topicDir).read()).rejects.toBeInstanceOf(StateCorruptionError);
  });

  it('rejects a symlinked recovery temp without replacing local state', async () => {
    const from = { count: 1 };
    const to = { count: 2 };
    await writeState(from);
    const outside = path.join(topicDir, 'outside.json');
    await fs.writeFile(outside, `${JSON.stringify(to, null, 2)}\n`);
    await fs.symlink(outside, path.join(topicDir, '.state.json.tmp'));
    await fs.writeFile(
      path.join(topicDir, '.state.json.journal'),
      JSON.stringify({
        version: 1,
        fromRevision: revision(from),
        toRevision: revision(to),
        tempFile: '.state.json.tmp',
      }),
    );
    await expect(new StateStore<{ count: number }>(topicDir).read()).rejects.toBeInstanceOf(
      StateRecoveryError,
    );
    expect(await fs.readFile(path.join(topicDir, 'state.json'), 'utf8')).toBe(
      `${JSON.stringify(from, null, 2)}\n`,
    );
    expect(JSON.parse(await fs.readFile(outside, 'utf8'))).toEqual(to);
  });

  it('fails closed on a symlinked lock without touching its external owner', async () => {
    await writeState({ count: 1 });
    const outside = path.join(topicDir, 'outside-lock');
    await fs.mkdir(outside);
    await fs.writeFile(path.join(outside, 'owner.json'), 'sentinel');
    await fs.symlink(outside, path.join(topicDir, '.state.json.lock'));
    await expect(
      new StateStore<{ count: number }>(topicDir, { lockTimeoutMs: 10 }).read(),
    ).rejects.toBeInstanceOf(StateRecoveryError);
    expect(await fs.readFile(path.join(outside, 'owner.json'), 'utf8')).toBe('sentinel');
  });
});
