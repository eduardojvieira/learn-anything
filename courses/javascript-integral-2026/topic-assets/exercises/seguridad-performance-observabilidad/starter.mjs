import assert from 'node:assert/strict';

/**
 * Acepta sólo { name, theme? }; rechaza claves inesperadas y valores que no son texto válido.
 * Devuelve un registro nuevo: nunca copies input con Object.assign ni spread sin validar.
 * @param {unknown} input
 */
export function parseProfile(input) {
  // TODO: validar la frontera y devolver sólo los campos permitidos.
}

/**
 * Resume muestras { durationMs, ok } sin guardar payloads, tokens ni mensajes de error.
 * @param {readonly unknown[]} samples
 */
export function requestMetrics(samples) {
  // TODO: validar muestras y calcular count, errors, totalMs y maxMs.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
assert.deepEqual(parseProfile({ name: 'Noa', theme: 'dark' }), { name: 'Noa', theme: 'dark' });
assert.throws(
  () => parseProfile(JSON.parse('{"__proto__":{"admin":true},"name":"Noa"}')),
  TypeError,
);
assert.deepEqual(
  requestMetrics([
    { durationMs: 12, ok: true },
    { durationMs: 8, ok: false },
  ]),
  {
    count: 2,
    errors: 1,
    totalMs: 20,
    maxMs: 12,
  },
);
assert.throws(
  () =>
    requestMetrics([
      { durationMs: Number.MAX_VALUE, ok: true },
      { durationMs: Number.MAX_VALUE, ok: true },
    ]),
  RangeError,
);
