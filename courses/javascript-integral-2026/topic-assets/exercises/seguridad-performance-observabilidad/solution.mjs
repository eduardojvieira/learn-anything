import assert from 'node:assert/strict';

const profileKeys = new Set(['name', 'theme']);

/** @param {unknown} input */
export function parseProfile(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    throw new TypeError('El perfil debe ser un objeto');
  const record = /** @type {Record<string, unknown>} */ (input);
  for (const key of Object.keys(record))
    if (!profileKeys.has(key)) throw new TypeError(`Campo no permitido: ${key}`);
  if (
    !Object.hasOwn(record, 'name') ||
    typeof record.name !== 'string' ||
    record.name.trim() === ''
  )
    throw new TypeError('name debe ser un texto no vacío');
  if (Object.hasOwn(record, 'theme') && record.theme !== 'light' && record.theme !== 'dark')
    throw new TypeError('theme debe ser light o dark');
  return Object.hasOwn(record, 'theme')
    ? { name: record.name, theme: record.theme }
    : { name: record.name };
}

/** @param {readonly unknown[]} samples */
export function requestMetrics(samples) {
  if (!Array.isArray(samples)) throw new TypeError('samples debe ser un array');
  let errors = 0;
  let totalMs = 0;
  let maxMs = 0;
  for (const sample of samples) {
    if (sample === null || typeof sample !== 'object' || Array.isArray(sample))
      throw new TypeError('Cada muestra debe ser un objeto');
    const { durationMs, ok } = /** @type {{durationMs?: unknown, ok?: unknown}} */ (sample);
    if (!Number.isFinite(durationMs) || durationMs < 0 || typeof ok !== 'boolean')
      throw new TypeError('durationMs finito no negativo y ok boolean son requeridos');
    totalMs += durationMs;
    if (!Number.isFinite(totalMs)) throw new RangeError('La suma de durationMs debe ser finita');
    maxMs = Math.max(maxMs, durationMs);
    if (!ok) errors++;
  }
  return { count: samples.length, errors, totalMs, maxMs };
}

assert.deepEqual(parseProfile({ name: 'Noa', theme: 'dark' }), { name: 'Noa', theme: 'dark' });
assert.deepEqual(parseProfile({ name: 'Noa' }), { name: 'Noa' });
for (const bad of [
  null,
  [],
  { name: '' },
  { name: 'Noa', theme: 'neon' },
  { name: 'Noa', admin: true },
  JSON.parse('{"__proto__":{"admin":true},"name":"Noa"}'),
  Object.create({ name: 'Noa' }),
])
  assert.throws(() => parseProfile(bad), TypeError);
const input = Object.freeze({ name: 'Noa', theme: 'light' });
assert.notStrictEqual(parseProfile(input), input);
assert.deepEqual(requestMetrics([]), { count: 0, errors: 0, totalMs: 0, maxMs: 0 });
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
for (const bad of [
  null,
  {},
  [{ durationMs: -1, ok: true }],
  [{ durationMs: NaN, ok: true }],
  [{ durationMs: 1, ok: 'yes' }],
])
  assert.throws(() => requestMetrics(bad), TypeError);
assert.throws(
  () =>
    requestMetrics([
      { durationMs: Number.MAX_VALUE, ok: true },
      { durationMs: Number.MAX_VALUE, ok: true },
    ]),
  RangeError,
);
