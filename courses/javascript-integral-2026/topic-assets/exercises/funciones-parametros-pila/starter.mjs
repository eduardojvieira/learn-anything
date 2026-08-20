import assert from 'node:assert/strict';

/** Recibe un pedido, aplica defaults y devuelve un resumen sin mutar la entrada. */
export function summarizeOrder(order, prefix = 'Pedido') {
  // TODO: destructuring, defaults y validación del contrato.
}

/** Llama una función con argumentos recibidos por rest y enviados por spread. */
export function callWith(fn, ...args) {
  // TODO: validar fn y retornar fn(...args).
}

/** Aplica una callback a cada valor y devuelve un array nuevo. */
export function mapValues(values, transform) {
  // TODO: validar y usar la callback sin mutar values.
}

/** Cuenta recursivamente hasta cero; maxDepth no puede superar el techo propio. */
export function countdown(value, maxDepth = 1000) {
  // TODO: validar value, maxDepth y el techo propio antes de recursar.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
assert.deepEqual(summarizeOrder({ id: 'A-1', items: ['mate'] }), {
  label: 'Pedido A-1',
  itemCount: 1,
  note: 'sin nota',
});
assert.equal(
  callWith((a, b) => a + b, 2, 3),
  5,
);
assert.deepEqual(
  mapValues([1, 2], (value, index) => value + index),
  [1, 3],
);
assert.equal(countdown(3), 3);
assert.throws(
  () => countdown(50_000, 50_000),
  (error) =>
    error instanceof RangeError && error.message === 'La profundidad excede el techo recursivo',
);
