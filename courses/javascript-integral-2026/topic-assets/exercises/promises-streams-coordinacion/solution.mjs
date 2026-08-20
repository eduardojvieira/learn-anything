import assert from 'node:assert/strict';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export function delay(ms, { signal } = {}) {
  if (!Number.isInteger(ms) || ms < 0) throw new RangeError('ms debe ser un entero no negativo');
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, ms);
    signal?.addEventListener('abort', abort, { once: true });
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
  });
}
export async function withTimeout(operation, timeoutMs) {
  if (typeof operation !== 'function') throw new TypeError('operation debe ser función');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0)
    throw new RangeError('timeoutMs debe ser un entero no negativo');
  const controller = new AbortController();
  const timeout = new Error(`Tiempo agotado tras ${timeoutMs} ms`);
  timeout.name = 'TimeoutError';
  const timer = setTimeout(() => controller.abort(timeout), timeoutMs);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
export async function mapLimit(items, limit, worker, { signal } = {}) {
  if (!Array.isArray(items) || typeof worker !== 'function')
    throw new TypeError('items y worker válidos son requeridos');
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError('limit debe ser un entero positivo');
  if (signal?.aborted) throw signal.reason;
  const results = new Array(items.length);
  let next = 0;
  async function consume() {
    while (next < items.length) {
      if (signal?.aborted) throw signal.reason;
      const index = next++;
      results[index] = await worker(items[index], index, signal);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, consume));
  return results;
}
export async function uppercaseStream(chunks, { signal } = {}) {
  if (!Array.isArray(chunks) || chunks.some((chunk) => typeof chunk !== 'string'))
    throw new TypeError('chunks debe ser un array de strings');
  const output = [];
  const upper = new Transform({
    transform(chunk, _encoding, callback) {
      callback(null, String(chunk).toUpperCase());
    },
  });
  const sink = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, callback) {
      output.push(String(chunk));
      callback();
    },
  });
  await pipeline(Readable.from(chunks), upper, sink, { signal });
  return output;
}

assert.equal(await delay(0).then(() => 'listo'), 'listo');
assert.throws(() => delay(-1), RangeError);
const thenable = {
  then(resolve) {
    resolve(3);
  },
};
assert.equal(await Promise.resolve(thenable).then((n) => n + 1), 4);
assert.equal(await withTimeout((signal) => delay(0, { signal }).then(() => 7), 20), 7);
await assert.rejects(
  withTimeout((signal) => delay(20, { signal }), 0),
  (error) => error.name === 'TimeoutError',
);
const controller = new AbortController();
const aborted = delay(20, { signal: controller.signal });
controller.abort(new Error('Cancelado por quien llama'));
await assert.rejects(aborted, /Cancelado/);
let active = 0;
let peak = 0;
assert.deepEqual(
  await mapLimit([1, 2, 3, 4], 2, async (n) => {
    peak = Math.max(peak, ++active);
    await delay(0);
    active--;
    return n * 2;
  }),
  [2, 4, 6, 8],
);
assert.equal(peak, 2);
const workerFailure = new TypeError('worker caído');
await assert.rejects(
  mapLimit([1], 1, async () => {
    throw workerFailure;
  }),
  (error) => error === workerFailure,
);
assert.deepEqual(
  await Promise.allSettled([Promise.resolve(1), Promise.reject(new Error('x'))]).then((xs) =>
    xs.map((x) => x.status),
  ),
  ['fulfilled', 'rejected'],
);
assert.equal(
  await Promise.any([Promise.reject(new Error('x')), Promise.resolve('primera')]),
  'primera',
);
assert.equal(
  await Promise.race([delay(0).then(() => 'rápida'), delay(20).then(() => 'lenta')]),
  'rápida',
);
assert.deepEqual(await uppercaseStream(['hola', ' ñandú']), ['HOLA', ' ÑANDÚ']);
const streamController = new AbortController();
streamController.abort(new Error('Stream cancelado'));
await assert.rejects(uppercaseStream(['x'], { signal: streamController.signal }));
