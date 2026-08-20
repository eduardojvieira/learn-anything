import assert from 'node:assert/strict';

/** Outbox en memoria: sólo payload JSON sin pérdida e idempotencia por key. */
export function createOutbox({ deliver, maxPending = 2, maxAttempts = 2 }) {
  /* TODO: validar opciones y mantener entries por key */
  return {
    send(job) {
      /* TODO: normalizar JSON, deduplicar, limitar trabajo en vuelo y reintentar */
    },
  };
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const outbox = createOutbox({ deliver: async ({ payload }) => ({ accepted: payload.id }) });
assert.deepEqual(await outbox.send({ key: 'evt-1', payload: { id: 1 } }), { accepted: 1 });
