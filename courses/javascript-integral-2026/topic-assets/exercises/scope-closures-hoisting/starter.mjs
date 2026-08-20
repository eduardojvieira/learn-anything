import assert from 'node:assert/strict';

/** Crea estado privado: take(amount) y remaining() comparten el mismo binding. */
export function createQuota(limit) {
  // TODO: validar limit y devolver las dos operaciones.
}

/** Devuelve un lector por string; rechaza huecos y cada lector conserva su elemento de la iteración. */
export function createItemReaders(items) {
  // TODO: validar todos los índices, incluidos huecos, y crear closures por iteración.
}

/** Proyecta id y name para que la closure no necesite el registro entero. */
export function createLabel(record) {
  // TODO: validar el registro, extraer los primitivos y devolver la closure.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const quota = createQuota(3);
assert.equal(quota.take(2), 1);
assert.equal(quota.remaining(), 1);
assert.throws(() => quota.take(2), RangeError);
assert.equal(quota.remaining(), 1);
assert.deepEqual(
  createItemReaders(['uno', 'dos']).map((read) => read()),
  ['uno', 'dos'],
);
assert.throws(() => createItemReaders(new Array(1)), TypeError);
const record = { id: 7, name: 'Luz', payload: {} };
const label = createLabel(record);
record.id = 8;
record.name = 'Sol';
assert.equal(label(), '7: Luz');
