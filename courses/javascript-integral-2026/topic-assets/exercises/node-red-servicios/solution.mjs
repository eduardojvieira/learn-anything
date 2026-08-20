import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

/** Outbox en memoria para payload JSON plano; no sustituye una restricción única durable. */
export function createOutbox({ deliver, maxPending = 2, maxAttempts = 2 }) {
  if (typeof deliver !== 'function') throw new TypeError('deliver debe ser función');
  if (!Number.isSafeInteger(maxPending) || maxPending < 1)
    throw new RangeError('maxPending inválido');
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1)
    throw new RangeError('maxAttempts inválido');
  const entries = new Map();
  let pending = 0;
  return {
    send(job) {
      if (
        job === null ||
        typeof job !== 'object' ||
        typeof job.key !== 'string' ||
        !job.key ||
        job.payload === null ||
        typeof job.payload !== 'object' ||
        Array.isArray(job.payload)
      )
        throw new TypeError('job requiere key y payload JSON plano');
      let payload;
      try {
        payload = JSON.parse(JSON.stringify(job.payload));
      } catch {
        throw new TypeError('payload debe ser JSON serializable');
      }
      if (!isDeepStrictEqual(job.payload, payload))
        throw new TypeError('payload contiene valores JSON con pérdida');
      const existing = entries.get(job.key);
      if (existing) {
        if (!isDeepStrictEqual(existing.payload, payload))
          throw new RangeError('key reutilizada con otro payload');
        return existing.promise;
      }
      if (pending >= maxPending) throw new RangeError('outbox sin capacidad');
      pending++;
      const entry = { payload, promise: null };
      entry.promise = Promise.resolve().then(async () => {
        try {
          for (let attempt = 1; ; attempt++) {
            try {
              return await deliver({ ...job, payload });
            } catch (error) {
              if (!error?.retryable || attempt === maxAttempts) throw error;
            }
          }
        } catch (error) {
          entries.delete(job.key);
          throw error;
        } finally {
          pending--;
        }
      });
      entries.set(job.key, entry);
      return entry.promise;
    },
  };
}

assert.throws(() => createOutbox({ deliver: null }), TypeError);
assert.throws(() => createOutbox({ deliver() {}, maxPending: 0 }), RangeError);
let calls = 0,
  release;
const gate = new Promise((resolve) => (release = resolve));
const outbox = createOutbox({
  deliver: async ({ payload }) => {
    calls++;
    await gate;
    return { accepted: payload.id };
  },
});
const first = outbox.send({ key: 'evt-1', payload: { id: 1 } });
const duplicate = outbox.send({ key: 'evt-1', payload: { id: 1 } });
assert.strictEqual(first, duplicate);
assert.throws(() => outbox.send({ key: 'evt-1', payload: { id: 2 } }), RangeError);
release();
assert.deepEqual(await first, { accepted: 1 });
assert.deepEqual(await outbox.send({ key: 'evt-1', payload: { id: 1 } }), { accepted: 1 });
assert.equal(calls, 1);
const structural = outbox.send({ key: 'evt-order', payload: { a: 1, b: 2 } });
assert.strictEqual(structural, outbox.send({ key: 'evt-order', payload: { b: 2, a: 1 } }));
assert.deepEqual(await structural, { accepted: undefined });
assert.equal(calls, 2);
assert.throws(() => outbox.send({ key: 'evt-lossy', payload: { omitted: undefined } }), TypeError);
let syncCalls = 0;
const synchronousFailure = createOutbox({
  deliver() {
    syncCalls++;
    throw new Error('sync');
  },
});
await assert.rejects(synchronousFailure.send({ key: 'evt-sync', payload: {} }), /sync/);
await assert.rejects(synchronousFailure.send({ key: 'evt-sync', payload: {} }), /sync/);
assert.equal(syncCalls, 2);
let attempts = 0;
const retried = createOutbox({
  deliver: async () => {
    attempts++;
    if (attempts === 1) throw Object.assign(new Error('timeout'), { retryable: true });
    return 'delivered';
  },
  maxAttempts: 2,
});
assert.equal(await retried.send({ key: 'evt-2', payload: { id: 2 } }), 'delivered');
assert.equal(attempts, 2);
const exhausted = createOutbox({
  deliver: async () => {
    throw Object.assign(new Error('invalid'), { retryable: false });
  },
});
await assert.rejects(exhausted.send({ key: 'evt-3', payload: { id: 3 } }), /invalid/);
assert.throws(() => exhausted.send({ key: '', payload: {} }), TypeError);
assert.throws(() => exhausted.send({ key: 'evt-4', payload: [] }), TypeError);
let unblock;
const blocked = new Promise((resolve) => (unblock = resolve));
const limited = createOutbox({ deliver: async () => blocked, maxPending: 1 });
const pending = limited.send({ key: 'evt-5', payload: { id: 5 } });
assert.throws(() => limited.send({ key: 'evt-6', payload: { id: 6 } }), RangeError);
unblock('ok');
assert.equal(await pending, 'ok');
