import assert from 'node:assert/strict';

const requiredEvidence = ['unit', 'integration', 'contract', 'e2e', 'review'];

/** Resume evidencia de entrega: coverage informa alcance, pero no reemplaza ningún riesgo observado. */
export function releaseDecision(evidence) {
  if (evidence === null || typeof evidence !== 'object' || Array.isArray(evidence))
    throw new TypeError('evidence debe ser un registro');
  for (const key of requiredEvidence)
    if (!Object.hasOwn(evidence, key) || typeof evidence[key] !== 'boolean')
      throw new TypeError(`evidence.${key} debe ser boolean`);
  if (!Number.isFinite(evidence.coverage) || evidence.coverage < 0 || evidence.coverage > 100)
    throw new RangeError('coverage debe ser un porcentaje entre 0 y 100');
  if (
    evidence.migration === null ||
    typeof evidence.migration !== 'object' ||
    Array.isArray(evidence.migration)
  )
    throw new TypeError('migration debe ser un registro');
  for (const key of ['backup', 'forward', 'rollback', 'recovery'])
    if (!Object.hasOwn(evidence.migration, key) || typeof evidence.migration[key] !== 'boolean')
      throw new TypeError(`migration.${key} debe ser boolean`);
  const blockers = requiredEvidence.filter((key) => evidence[key] === false);
  for (const key of ['backup', 'forward'])
    if (evidence.migration[key] === false) blockers.push(`migration.${key}`);
  if (!evidence.migration.rollback && !evidence.migration.recovery)
    blockers.push('migration.rollbackOrRecovery');
  return { ready: blockers.length === 0, blockers, coverage: evidence.coverage };
}

/** Ejecuta trabajos async sin superar concurrency y conserva el orden de entrada en la salida. */
export async function runBatch(items, worker, { concurrency = 1 } = {}) {
  if (!Array.isArray(items) || typeof worker !== 'function')
    throw new TypeError('items debe ser array y worker una función');
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new RangeError('concurrency debe ser un entero seguro positivo');
  const results = new Array(items.length);
  let next = 0;
  async function consume() {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, consume));
  return results;
}

const complete = {
  unit: true,
  integration: true,
  contract: true,
  e2e: true,
  review: true,
  migration: { backup: true, forward: true, rollback: true, recovery: false },
  coverage: 100,
};
assert.deepEqual(releaseDecision(complete), { ready: true, blockers: [], coverage: 100 });
assert.deepEqual(releaseDecision({ ...complete, contract: false, coverage: 100 }), {
  ready: false,
  blockers: ['contract'],
  coverage: 100,
});
assert.equal(
  releaseDecision({ ...complete, migration: { ...complete.migration, recovery: true } }).ready,
  true,
);
assert.equal(
  releaseDecision({
    ...complete,
    migration: { ...complete.migration, rollback: false, recovery: true },
  }).ready,
  true,
);
assert.deepEqual(
  releaseDecision({ ...complete, migration: { ...complete.migration, rollback: false } }).blockers,
  ['migration.rollbackOrRecovery'],
);
assert.throws(() => releaseDecision({ coverage: 100 }), TypeError);
const missingReview = { ...complete };
delete missingReview.review;
assert.throws(() => releaseDecision(missingReview), TypeError);
assert.throws(() => releaseDecision({ ...complete, coverage: 101 }), RangeError);

let active = 0;
let peak = 0;
const results = await runBatch(
  [3, 1, 2],
  async (value) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return value * 10;
  },
  { concurrency: 2 },
);
assert.deepEqual(results, [30, 10, 20]);
assert.equal(peak, 2);
assert.deepEqual(await runBatch([], async () => 0), []);
await assert.rejects(() => runBatch([1], null), TypeError);
await assert.rejects(() => runBatch([1], async () => 1, { concurrency: 0 }), RangeError);
