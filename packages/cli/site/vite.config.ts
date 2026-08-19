import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig(() => {
  // In dev, points to test fixtures by default. Override via TOPICS_DIR env var for real data.
  const topicsDir = process.env.TOPICS_DIR || resolve(__dirname, '../test/fixtures/topics');

  let apiProcess: ChildProcess | null = null;
  const intentionalStops = new WeakSet<ChildProcess>();

  function cleanup() {
    if (apiProcess) stopApiProcess(apiProcess);
  }

  function stopApiProcess(child: ChildProcess) {
    intentionalStops.add(child);
    if (apiProcess === child) apiProcess = null;
    if (child.exitCode === null) child.kill('SIGTERM');
  }

  function removeProcessListeners(fn: () => void) {
    process.removeListener('SIGINT', fn);
    process.removeListener('SIGTERM', fn);
  }

  let boundCleanup: (() => void) | null = null;

  return {
    plugins: [
      vue(),
      tailwindcss(),
      {
        name: 'serve-api',
        apply: 'serve',
        configureServer(server) {
          function startApiProcess() {
            if (apiProcess) stopApiProcess(apiProcess);
            const child = spawn('node', ['serve.mjs'], {
              cwd: __dirname,
              stdio: 'inherit',
              env: {
                ...process.env,
                PORT: '24277',
                TOPICS_DIR: topicsDir,
              },
            });
            apiProcess = child;

            const failClosed = (reason: string) => {
              if (intentionalStops.has(child)) return;
              console.error(`[serve-api] API server stopped unexpectedly: ${reason}`);
              if (apiProcess === child) apiProcess = null;
              server.httpServer?.close();
            };

            child.on('error', (err) => {
              console.error(`[serve-api] Failed to start API server: ${err.message}`);
              failClosed('spawn error');
            });

            child.on('exit', (code, signal) => {
              if (apiProcess === child) apiProcess = null;
              if (!intentionalStops.has(child))
                failClosed(signal ? `signal ${signal}` : `code ${code}`);
            });
          }

          if (boundCleanup) {
            removeProcessListeners(boundCleanup);
          }

          startApiProcess();

          boundCleanup = cleanup;
          server.httpServer?.on('close', cleanup);
          process.on('SIGINT', cleanup);
          process.on('SIGTERM', cleanup);
        },
      },
    ],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    },
    server: {
      host: true,
      port: 24278,
      proxy: {
        '/api': {
          target: 'http://localhost:24277',
          changeOrigin: false,
        },
      },
    },
  };
});
