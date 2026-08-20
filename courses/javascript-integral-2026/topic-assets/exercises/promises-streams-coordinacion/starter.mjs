import assert from 'node:assert/strict';

export function delay(ms, { signal } = {}) {
  /* TODO: validar ms, escuchar abort y limpiar timer/listener */
}
export async function withTimeout(operation, timeoutMs) {
  /* TODO: crear AbortController, pasar signal, abortar y limpiar el timer */
}
export async function mapLimit(items, limit, worker, { signal } = {}) {
  /* TODO: validar, propagar signal y coordinar una cantidad limitada de workers */
}
export async function uppercaseStream(chunks, { signal } = {}) {
  /* TODO: usar pipeline de node:stream/promises; no acumules con eventos manuales */
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
assert.equal(await delay(0).then(() => 'listo'), 'listo');
assert.equal(await withTimeout((signal) => delay(0, { signal }).then(() => 7), 20), 7);
assert.deepEqual(await mapLimit([1, 2, 3], 2, async (n) => n * 2), [2, 4, 6]);
assert.deepEqual(await uppercaseStream(['a', 'b']), ['A', 'B']);
