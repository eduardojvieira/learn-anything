import assert from 'node:assert/strict';

/** Valida `{ type: 'increment', amount: entero Int32 firmado }` como dato plano. @param {unknown} message */
export function validateCounterMessage(message) {
  // TODO: devolver una copia normalizada o lanzar TypeError.
}

/** Suma amount atómicamente al índice 0 de una Int32Array compartida. @param {Int32Array} counter @param {number} amount */
export function incrementSharedCounter(counter, amount) {
  // TODO: validar el view y amount; luego usar Atomics.add.
}

/** Reporta capacidades sin hacer que un runtime viejo deba parsear `using`. */
export function resourceManagementSupport() {
  // TODO: detectar símbolos, stacks y sintaxis aislada de explicit resource management.
}

// RED inicialmente: implementá hasta que estos asserts pasen.
assert.deepEqual(validateCounterMessage({ type: 'increment', amount: 2 }), {
  type: 'increment',
  amount: 2,
});
assert.throws(() => validateCounterMessage({ type: 'increment', amount: 1.5 }), TypeError);
assert.throws(() => validateCounterMessage({ type: 'increment', amount: 2 ** 31 }), TypeError);
const counter = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
assert.equal(incrementSharedCounter(counter, 3), 0);
assert.equal(Atomics.load(counter, 0), 3);
assert.throws(() => incrementSharedCounter(new Int32Array(1), 1), TypeError);
assert.throws(() => incrementSharedCounter(counter, -(2 ** 31) - 1), TypeError);
assert.equal(typeof resourceManagementSupport().symbols.dispose, 'boolean');
