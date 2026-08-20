import assert from 'node:assert/strict';

const MIN_INT32 = -(2 ** 31);
const MAX_INT32 = 2 ** 31 - 1;

/** @param {unknown} value */
function isInt32(value) {
  return Number.isInteger(value) && value >= MIN_INT32 && value <= MAX_INT32;
}

/** @param {unknown} message */
export function validateCounterMessage(message) {
  if (message === null || Object.getPrototypeOf(message) !== Object.prototype)
    throw new TypeError('El mensaje debe ser un objeto plano');
  const value = /** @type {{type?: unknown, amount?: unknown}} */ (message);
  if (value.type !== 'increment' || !isInt32(value.amount))
    throw new TypeError('Se espera { type: "increment", amount: entero Int32 firmado }');
  return { type: 'increment', amount: value.amount };
}
/** @param {Int32Array} counter @param {number} amount */
export function incrementSharedCounter(counter, amount) {
  if (!(counter instanceof Int32Array) || !(counter.buffer instanceof SharedArrayBuffer))
    throw new TypeError('counter debe ser una Int32Array sobre SharedArrayBuffer');
  if (!isInt32(amount)) throw new TypeError('amount debe ser un entero Int32 firmado');
  return Atomics.add(counter, 0, amount);
}
function supportsSyntax(source) {
  try {
    Function(source);
    return true;
  } catch {
    return false;
  }
}
export function resourceManagementSupport() {
  return {
    symbols: {
      dispose: typeof Symbol.dispose === 'symbol',
      asyncDispose: typeof Symbol.asyncDispose === 'symbol',
    },
    stacks: {
      disposable: typeof globalThis.DisposableStack === 'function',
      asyncDisposable: typeof globalThis.AsyncDisposableStack === 'function',
    },
    syntax: {
      using: supportsSyntax('using resource = { [Symbol.dispose]() {} };'),
      awaitUsing: supportsSyntax(
        'async function f() { await using resource = { [Symbol.asyncDispose]: async () => {} }; }',
      ),
    },
  };
}
assert.deepEqual(validateCounterMessage({ type: 'increment', amount: 2 }), {
  type: 'increment',
  amount: 2,
});
for (const invalid of [
  null,
  [],
  { type: 'increment', amount: 1.5 },
  { type: 'increment', amount: MAX_INT32 + 1 },
  { type: 'read', amount: 1 },
])
  assert.throws(() => validateCounterMessage(invalid), TypeError);
const counter = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
assert.equal(incrementSharedCounter(counter, 3), 0);
assert.equal(incrementSharedCounter(counter, -1), 3);
assert.equal(Atomics.load(counter, 0), 2);
assert.throws(() => incrementSharedCounter(new Int32Array(1), 1), TypeError);
assert.throws(() => incrementSharedCounter(counter, 1.5), TypeError);
assert.throws(() => incrementSharedCounter(counter, MIN_INT32 - 1), TypeError);
Atomics.store(counter, 0, MAX_INT32);
assert.equal(incrementSharedCounter(counter, 1), MAX_INT32);
assert.equal(Atomics.load(counter, 0), MIN_INT32);
const support = resourceManagementSupport();
assert.equal(typeof support.symbols.dispose, 'boolean');
assert.equal(typeof support.syntax.using, 'boolean');
