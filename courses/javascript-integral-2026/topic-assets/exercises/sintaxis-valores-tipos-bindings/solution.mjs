import assert from 'node:assert/strict';

/** @param {unknown} value */
export function describeValue(value) {
  const type = typeof value;
  if (value === null) return { type, category: 'primitive', kind: 'null' };
  if (value === undefined) return { type, category: 'primitive', kind: 'undefined' };
  if (type === 'number') {
    const kind = Number.isNaN(value)
      ? 'NaN'
      : Object.is(value, -0)
        ? '-0'
        : value === Infinity
          ? '+Infinity'
          : value === -Infinity
            ? '-Infinity'
            : 'number';
    return { type, category: 'primitive', kind };
  }
  if (type === 'bigint' || type === 'string' || type === 'boolean' || type === 'symbol')
    return { type, category: 'primitive', kind: type };
  if (type === 'function') return { type, category: 'object', kind: 'callable' };
  return { type, category: 'object', kind: Array.isArray(value) ? 'array' : 'object' };
}

/** @param {unknown} a @param {unknown} b */
export function addIntegers(a, b) {
  if (typeof a !== typeof b || (typeof a !== 'number' && typeof a !== 'bigint'))
    throw new TypeError('Los operandos deben ser Number o BigInt homogéneos');
  if (typeof a === 'bigint') return a + b;
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b))
    throw new RangeError('Los Number deben ser enteros seguros');
  const sum = a + b;
  if (!Number.isSafeInteger(sum)) throw new RangeError('La suma excede el entero seguro');
  return sum;
}

/** @param {unknown} user @param {unknown} name */
export function withName(user, name) {
  if (user === null || typeof user !== 'object' || Array.isArray(user))
    throw new TypeError('user debe ser un registro no-array y no-callable');
  if (typeof name !== 'string' || name.trim() === '')
    throw new TypeError('name debe ser un texto no vacío');
  return { ...user, name };
}

assert.deepEqual(describeValue(null), { type: 'object', category: 'primitive', kind: 'null' });
assert.equal(describeValue(undefined).kind, 'undefined');
assert.equal(describeValue(1).kind, 'number');
assert.equal(describeValue(NaN).kind, 'NaN');
assert.equal(describeValue(-0).kind, '-0');
assert.equal(describeValue(Infinity).kind, '+Infinity');
assert.equal(describeValue(-Infinity).kind, '-Infinity');
assert.equal(describeValue(1n).kind, 'bigint');
assert.equal(describeValue('').kind, 'string');
assert.equal(describeValue(false).kind, 'boolean');
assert.equal(describeValue(Symbol('x')).kind, 'symbol');
assert.equal(describeValue([]).kind, 'array');
assert.equal(describeValue({}).kind, 'object');
assert.deepEqual(
  describeValue(() => {}),
  { type: 'function', category: 'object', kind: 'callable' },
);
assert.equal(addIntegers(2, 3), 5);
assert.equal(addIntegers(2n, 3n), 5n);
assert.equal(5n / 2n, 2n);
for (const pair of [
  [1.5, 2],
  [Number.MAX_SAFE_INTEGER + 1, 0],
  [Number.MAX_SAFE_INTEGER, 1],
  [Number.MIN_SAFE_INTEGER, -1],
])
  assert.throws(() => addIntegers(...pair), RangeError);
for (const pair of [
  [1, 1n],
  ['1', '2'],
])
  assert.throws(() => addIntegers(...pair), TypeError);
assert.throws(() => addIntegers(Infinity, 1), RangeError);
const token = Symbol('token');
const proto = { inherited: true };
const user = Object.assign(Object.create(proto), {
  name: 'Ana',
  nested: { theme: 'paper' },
  [token]: 7,
});
Object.defineProperty(user, 'hidden', { value: 1, enumerable: false });
Object.freeze(user);
const renamed = withName(user, 'Noa');
assert.notStrictEqual(renamed, user);
assert.equal(user.name, 'Ana');
assert.equal(renamed.name, 'Noa');
assert.strictEqual(renamed.nested, user.nested);
assert.equal(renamed[token], 7);
assert.equal('inherited' in renamed, false);
assert.equal('hidden' in renamed, false);
for (const bad of [null, [], 'user', () => {}]) assert.throws(() => withName(bad, 'N'), TypeError);
assert.throws(() => withName({}, '  '), TypeError);
assert.throws(() => withName({}, 2), TypeError);
