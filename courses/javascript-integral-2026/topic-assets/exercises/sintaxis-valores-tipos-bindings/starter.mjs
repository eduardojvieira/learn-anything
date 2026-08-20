import assert from 'node:assert/strict';
/**
 * Devuelve { type, category: 'primitive'|'object', kind }.
 * `null` es primitive aunque typeof null sea "object"; una función es un objeto callable.
 * @param {unknown} value
 */
export function describeValue(value) {
  // TODO: distinguir todos los primitivos, NaN, -0, infinitos, arrays y funciones.
}

/** Sólo acepta dos Number enteros seguros o dos BigInt; nunca mezcla dominios. */
export function addIntegers(a, b) {
  // TODO: TypeError por tipo; RangeError por decimal, unsafe u overflow Number.
}

/** Devuelve una raíz nueva de un registro no-array/no-callable; copia props propias enumerables string y Symbol. */
export function withName(user, name) {
  // TODO: validar registro no-array/no-callable y nombre no vacío; nested queda compartido deliberadamente.
}

// RED inicialmente: implementá hasta que este archivo pase. solution.mjs es referencia posterior.
const symbol = Symbol('token');
const input = { nested: {}, [symbol]: 1 };
assert.equal(describeValue(null).kind, 'null');
assert.equal(describeValue(1n).kind, 'bigint');
assert.equal(addIntegers(2, 3), 5);
assert.equal(addIntegers(2n, 3n), 5n);
assert.throws(() => addIntegers(1, 1n), TypeError);
const output = withName(input, 'Noa');
assert.notStrictEqual(output, input);
assert.equal(output[symbol], 1);
assert.strictEqual(output.nested, input.nested);
