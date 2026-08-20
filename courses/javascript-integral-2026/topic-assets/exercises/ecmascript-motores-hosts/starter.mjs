/** @typedef {'language'|'engine'|'host'} Layer */
/** @typedef {{name: string, layer: Layer, probe: () => boolean, fallback?: string}} Capability */

import assert from 'node:assert/strict';

/**
 * Valida el catálogo y devuelve un reporte available/missing/error.
 * Un probe que devuelve algo distinto de boolean incumple el contrato.
 * Si fallback aparece, debe ser un string no vacío.
 * @param {Capability} item
 */
export function inspectCapability(item) {
  // TODO: validar name, layer, probe y fallback; capturar cualquier valor lanzado.
}

/** @param {Capability} item */
export function requireCapability(item) {
  // TODO: devolver el reporte disponible o lanzar Error con status y cause si existe.
}

/**
 * Inspecciona todos los ítems sin mutar items y los ordena con < y > de JS.
 * Para nombres iguales, preserva el orden original; no uses localeCompare.
 * @param {readonly Capability[]} items
 */
export function capabilityMatrix(items) {
  // TODO
}

assert.equal(
  inspectCapability({ name: 'Map', layer: 'language', probe: () => typeof Map === 'function' })
    .status,
  'available',
);
assert.equal(
  inspectCapability({ name: 'camera', layer: 'host', probe: () => false }).status,
  'missing',
);
assert.equal(
  inspectCapability({
    name: 'broken',
    layer: 'engine',
    probe: () => {
      throw new Error('boom');
    },
  }).error,
  'boom',
);
assert.equal(
  inspectCapability({
    name: 'string-throw',
    layer: 'host',
    probe: () => {
      throw 'offline';
    },
  }).error,
  'offline',
);
for (const bad of [
  null,
  { name: '', layer: 'host', probe: () => true },
  { name: 'x', layer: 'no', probe: () => true },
  { name: 'x', layer: 'host', probe: true },
  { name: 'x', layer: 'host', probe: () => true, fallback: 42 },
  { name: 'x', layer: 'host', probe: () => true, fallback: '' },
])
  assert.throws(() => inspectCapability(bad), TypeError);
assert.equal(
  inspectCapability({ name: 'bad return', layer: 'host', probe: () => 'yes' }).status,
  'error',
);
assert.equal(
  inspectCapability({ name: 'legacy', layer: 'host', probe: () => false, fallback: 'formulario' })
    .fallback,
  'formulario',
);
let caused;
try {
  requireCapability({
    name: 'db',
    layer: 'host',
    probe: () => {
      throw 'closed';
    },
  });
} catch (error) {
  caused = error;
}
assert.match(caused.message, /db: error/);
assert.equal(caused.cause, 'closed');
const input = Object.freeze([
  Object.freeze({ name: 'z', layer: 'host', probe: () => true }),
  Object.freeze({ name: 'á', layer: 'engine', probe: () => true }),
  Object.freeze({ name: 'a', layer: 'engine', probe: () => true }),
  Object.freeze({ name: 'a', layer: 'host', probe: () => false }),
]);
assert.deepEqual(
  capabilityMatrix(input).map(({ name, status }) => [name, status]),
  [
    ['a', 'available'],
    ['a', 'missing'],
    ['z', 'available'],
    ['á', 'available'],
  ],
);
assert.deepEqual(
  input.map((item) => [item.name, item.layer]),
  [
    ['z', 'host'],
    ['á', 'engine'],
    ['a', 'engine'],
    ['a', 'host'],
  ],
);
