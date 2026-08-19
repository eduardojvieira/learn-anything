import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

let root = '';
let server: ChildProcess | undefined;

afterEach(async () => {
  if (server?.exitCode === null) {
    server.kill();
    await once(server, 'exit');
  }
  server = undefined;
  if (root) await rm(root, { recursive: true, force: true });
  root = '';
});

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const address = probe.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  const { port } = address;
  await new Promise<void>((resolve, reject) =>
    probe.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function startServer(topicsDir: string): Promise<string> {
  const port = await freePort();
  server = spawn('node', ['site/serve.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), TOPICS_DIR: topicsDir },
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out starting site server')), 5_000);
    server?.once('error', reject);
    server?.stdout?.on('data', (chunk) => {
      if (String(chunk).includes('SITE_READY')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server?.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Site server exited: ${code}`));
    });
  });
  return `http://127.0.0.1:${port}`;
}

describe('site search index', () => {
  it('indexes legacy notes and rendered nested V2 session views', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'site-search-'));
    const topic = path.join(root, 'v2-topic');
    await mkdir(path.join(topic, 'sessions', '00000000-0000-4000-8000-000000000001', 'views'), {
      recursive: true,
    });
    await writeFile(
      path.join(topic, 'state.json'),
      JSON.stringify({ version: 2, topic: 'V2 Topic', slug: 'v2-topic', domains: [] }),
    );
    await writeFile(path.join(topic, 'sessions', 'legacy.md'), '# Legacy note');
    await writeFile(
      path.join(topic, 'sessions', '00000000-0000-4000-8000-000000000001', 'views', 'en.md'),
      '# Rendered V2 session',
    );

    const base = await startServer(root);
    const index = (await (await fetch(`${base}/api/search-index`)).json()) as Array<{
      title: string;
      path: string;
      section: string;
    }>;
    expect(index).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Legacy note',
          path: '/topics/v2-topic/sessions/legacy.md',
        }),
        expect.objectContaining({
          title: 'Rendered V2 session',
          path: '/topics/v2-topic/sessions/00000000-0000-4000-8000-000000000001/views/en.md',
          section: 'V2 Topic',
        }),
      ]),
    );
  });
});
