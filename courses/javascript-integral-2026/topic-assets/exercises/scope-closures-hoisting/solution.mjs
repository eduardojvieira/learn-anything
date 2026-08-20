import assert from 'node:assert/strict';

function assertSafeInteger(value, name, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || (positive ? value <= 0 : value < 0))
    throw new RangeError(
      `${name} debe ser un entero seguro ${positive ? 'positivo' : 'no negativo'}`,
    );
}

/** Crea estado privado: take(amount) y remaining() comparten el mismo binding. */
export function createQuota(limit) {
  assertSafeInteger(limit, 'limit');
  let remaining = limit;
  return {
    take(amount) {
      assertSafeInteger(amount, 'amount', { positive: true });
      if (amount > remaining) throw new RangeError('La cuota no alcanza');
      remaining -= amount;
      return remaining;
    },
    remaining() {
      return remaining;
    },
  };
}

/** Devuelve un lector por string; rechaza huecos y cada lector conserva su elemento de la iteración. */
export function createItemReaders(items) {
  if (!Array.isArray(items) || Array.from(items).some((item) => typeof item !== 'string'))
    throw new TypeError('items debe ser un array de strings');
  const readers = [];
  for (const item of items) readers.push(() => item);
  return readers;
}

/** Proyecta id y name para que la closure no necesite el registro entero. */
export function createLabel(record) {
  if (record === null || typeof record !== 'object')
    throw new TypeError('record debe ser un objeto');
  const { id, name } = record;
  if (!Number.isSafeInteger(id) || typeof name !== 'string' || name.trim() === '')
    throw new TypeError('record requiere id seguro y name no vacío');
  return () => `${id}: ${name}`;
}

const quota = createQuota(5);
assert.equal(quota.remaining(), 5);
assert.equal(quota.take(2), 3);
assert.equal(quota.take(3), 0);
assert.throws(() => quota.take(1), RangeError);
assert.equal(quota.remaining(), 0);
assert.throws(() => createQuota(-1), RangeError);
assert.throws(() => quota.take(0), RangeError);
assert.throws(() => quota.take(1.5), RangeError);

const readers = createItemReaders(['uno', 'dos', 'tres']);
assert.deepEqual(
  readers.map((read) => read()),
  ['uno', 'dos', 'tres'],
);
assert.throws(() => createItemReaders('uno'), TypeError);
assert.throws(() => createItemReaders(['uno', 2]), TypeError);
assert.throws(() => createItemReaders(new Array(1)), TypeError);

const payload = { bytes: new Uint8Array(1_000) };
const record = { id: 7, name: 'Luz', payload };
const label = createLabel(record);
record.id = 8;
record.name = 'Sol';
assert.equal(label(), '7: Luz');
assert.throws(() => createLabel(null), TypeError);
assert.throws(() => createLabel({ id: 1.5, name: 'Luz' }), TypeError);
assert.throws(() => createLabel({ id: 1, name: '  ' }), TypeError);
