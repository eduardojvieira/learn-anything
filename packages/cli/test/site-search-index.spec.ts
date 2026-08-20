import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { copyFile, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
  const serverRoot = path.join(root, 'server');
  await mkdir(path.join(serverRoot, 'site'), { recursive: true });
  await mkdir(path.join(serverRoot, 'dist'));
  await copyFile(
    path.join(process.cwd(), 'site', 'serve.mjs'),
    path.join(serverRoot, 'site', 'serve.mjs'),
  );
  await writeFile(
    path.join(serverRoot, 'dist', 'dashboard-api.js'),
    [
      'export function assertCanonicalTopic() {}',
      'export async function handleDashboardApi() { return false; }',
      'export function resolveTopicDir() { return null; }',
      'export function respondDashboardError(res) { res.writeHead(500); res.end(); }',
      'export async function v2TopicSnapshot() { return { state: { domains: [] }, mastery: {} }; }',
    ].join('\n'),
  );
  server = spawn('node', [path.join(serverRoot, 'site', 'serve.mjs')], {
    env: { ...process.env, PORT: String(port), TOPICS_DIR: topicsDir },
  });
  let stderr = '';
  await new Promise<void>((resolve, reject) => {
    const fail = (message: string) => {
      clearTimeout(timer);
      reject(new Error(`${message}${stderr ? `\n${stderr}` : ''}`));
    };
    const timer = setTimeout(() => fail('Timed out starting site server'), 5_000);
    server?.once('error', (error) => fail(error.message));
    server?.stderr?.on('data', (chunk) => (stderr += String(chunk)));
    server?.stdout?.on('data', (chunk) => {
      if (String(chunk).includes('SITE_READY')) {
        clearTimeout(timer);
        resolve();
      }
    });
    server?.once('exit', (code) => {
      fail(`Site server exited: ${code}`);
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

  it('survives an ephemeral StateStore lock directory', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'site-watcher-'));
    const topic = path.join(root, 'v2-topic');
    await mkdir(topic, { recursive: true });
    await writeFile(
      path.join(topic, 'state.json'),
      JSON.stringify({ version: 2, topic: 'V2 Topic', slug: 'v2-topic', domains: [] }),
    );
    const base = await startServer(root);
    const lock = path.join(topic, '.state.json.lock');
    await mkdir(lock);
    await writeFile(path.join(lock, 'owner.json'), '{}');
    await rm(lock, { recursive: true, force: true });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(server?.exitCode).toBeNull();
    expect((await fetch(`${base}/api/topics`)).ok).toBe(true);
  });
});
