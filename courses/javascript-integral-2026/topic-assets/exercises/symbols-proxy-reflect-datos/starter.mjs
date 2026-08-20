import assert from 'node:assert/strict';

export function makeRange(from, to) {
  /* TODO: validar límites y exponer Symbol.iterator */
}

export function protectId(target) {
  /* TODO: exigir id propio string; Proxy + Reflect y no permitir borrar id */
}

export function jsonWithBigInt(value) {
  /* TODO: replacer/reviver para BigInt */
}

export function parseExactId(json) {
  /* TODO: detectar el tercer argumento context de JSON.parse */
}

export function cloneData(value) {
  /* TODO: detectar structuredClone o fallar explícitamente */
}

assert.deepEqual([...makeRange(2, 4)], [2, 3, 4]);
assert.throws(() => makeRange(4, 2), RangeError);

const protectedRecord = protectId({ id: 'u-1', label: 'Ada' });
protectedRecord.id = 'u-2';
assert.equal(protectedRecord.id, 'u-2');
assert.throws(() => protectId({ label: 'Ada' }), TypeError);
assert.throws(() => {
  protectedRecord.id = 1;
}, TypeError);
assert.throws(() => delete protectedRecord.id, TypeError);

assert.deepEqual(jsonWithBigInt({ amount: 42n }), { amount: 42n });
assert.throws(() => jsonWithBigInt({ amount: { $bigint: 1 } }), TypeError);
assert.throws(() => jsonWithBigInt({ amount: { $bigint: '0x2' } }), TypeError);
assert.throws(() => jsonWithBigInt({ amount: { $bigint: '01' } }), TypeError);

let parseSourceSupported = false;
JSON.parse('0', (_key, value, context) => {
  parseSourceSupported = value === 0 && context?.source === '0';
  return value;
});
if (parseSourceSupported) {
  assert.equal(parseExactId('{"id":9007199254740993}').id, 9007199254740993n);
} else {
  assert.throws(() => parseExactId('{"id":1}'), /context\.source/);
}

const clone = cloneData({ date: new Date('2026-01-01'), map: new Map([['x', 1]]) });
assert.equal(clone.date instanceof Date, true);
assert.equal(clone.map.get('x'), 1);
