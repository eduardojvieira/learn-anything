import assert from 'node:assert/strict';

/** Recibe un pedido, aplica defaults y devuelve un resumen sin mutar la entrada. */
export function summarizeOrder(order, prefix = 'Pedido') {
  if (order === null || typeof order !== 'object' || Array.isArray(order))
    throw new TypeError('order debe ser un registro');
  if (typeof prefix !== 'string' || prefix.trim() === '')
    throw new TypeError('prefix debe ser texto no vacío');
  const { id, items = [], note = 'sin nota' } = order;
  if (typeof id !== 'string' || id.trim() === '') throw new TypeError('id debe ser texto no vacío');
  if (!Array.isArray(items)) throw new TypeError('items debe ser un array');
  if (typeof note !== 'string') throw new TypeError('note debe ser texto');
  return { label: `${prefix} ${id}`, itemCount: items.length, note };
}

/** Llama una función con argumentos recibidos por rest y enviados por spread. */
export function callWith(fn, ...args) {
  if (typeof fn !== 'function') throw new TypeError('fn debe ser una función');
  return fn(...args);
}

/** Aplica una callback a cada valor y devuelve un array nuevo. */
export function mapValues(values, transform) {
  if (!Array.isArray(values) || typeof transform !== 'function')
    throw new TypeError('values debe ser array y transform una función');
  return values.map((value, index) => transform(value, index));
}

export const MAX_RECURSIVE_DEPTH = 1000;

function countDownFrom(value, depth) {
  return value === 0 ? depth : countDownFrom(value - 1, depth + 1);
}

/** Cuenta recursivamente hasta cero; maxDepth no puede superar el techo propio. */
export function countdown(value, maxDepth = 1000) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('value debe ser entero seguro no negativo');
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) throw new RangeError('maxDepth inválido');
  if (maxDepth > MAX_RECURSIVE_DEPTH)
    throw new RangeError('La profundidad excede el techo recursivo');
  if (value > maxDepth) throw new RangeError('La profundidad excede el límite acordado');
  return countDownFrom(value, 0);
}

assert.deepEqual(summarizeOrder({ id: 'A-1', items: ['mate'] }), {
  label: 'Pedido A-1',
  itemCount: 1,
  note: 'sin nota',
});
assert.deepEqual(summarizeOrder({ id: 'B-2', items: [], note: 'retirar' }, 'Compra'), {
  label: 'Compra B-2',
  itemCount: 0,
  note: 'retirar',
});
assert.throws(() => summarizeOrder(null), TypeError);
assert.throws(() => summarizeOrder({ id: 'A', items: 'mate' }), TypeError);
assert.throws(() => summarizeOrder({ id: '' }), TypeError);
assert.equal(
  callWith((a, b) => a + b, 2, 3),
  5,
);
assert.equal(
  callWith(
    function join(...parts) {
      return parts.join('-');
    },
    'a',
    'b',
  ),
  'a-b',
);
assert.throws(() => callWith('no'), TypeError);
const source = [1, 2];
assert.deepEqual(
  mapValues(source, (value, index) => value + index),
  [1, 3],
);
assert.deepEqual(source, [1, 2]);
assert.throws(() => mapValues({}, (value) => value), TypeError);
assert.throws(() => mapValues([], null), TypeError);
assert.equal(countdown(0), 0);
assert.equal(countdown(3), 3);
assert.equal(countdown(3, 3), 3);
assert.throws(() => countdown(-1), RangeError);
assert.throws(() => countdown(3.5), RangeError);
assert.throws(() => countdown(4, 3), RangeError);
assert.throws(
  () => countdown(50_000, 50_000),
  (error) =>
    error instanceof RangeError && error.message === 'La profundidad excede el techo recursivo',
);
