import assert from 'node:assert/strict';

export function makeRange(from, to) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from > to) {
    throw new RangeError('integer range required');
  }

  return {
    from,
    to,
    *[Symbol.iterator]() {
      for (let value = from; value <= to; value += 1) yield value;
    },
  };
}

export function protectId(target) {
  if (
    target === null ||
    typeof target !== 'object' ||
    !Object.hasOwn(target, 'id') ||
    typeof target.id !== 'string'
  ) {
    throw new TypeError('own string id required');
  }

  return new Proxy(target, {
    set(object, key, value, receiver) {
      if (key === 'id' && typeof value !== 'string') throw new TypeError('id must be a string');
      return Reflect.set(object, key, value, receiver);
    },
    deleteProperty(object, key) {
      if (key === 'id') return false;
      return Reflect.deleteProperty(object, key);
    },
  });
}

export function jsonWithBigInt(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === 'bigint' ? { $bigint: item.toString() } : item,
    ),
    (_key, item) => {
      if (!item || typeof item !== 'object' || !Object.hasOwn(item, '$bigint')) return item;
      if (
        Object.keys(item).length !== 1 ||
        typeof item.$bigint !== 'string' ||
        !/^(?:0|-?[1-9]\d*)$/.test(item.$bigint)
      ) {
        throw new TypeError('canonical decimal $bigint required');
      }
      return BigInt(item.$bigint);
    },
  );
}

export function supportsJsonParseSource() {
  let supported = false;
  JSON.parse('0', (_key, value, context) => {
    supported = value === 0 && context?.source === '0';
    return value;
  });
  return supported;
}

export function parseExactId(json) {
  if (!supportsJsonParseSource()) {
    throw new Error('JSON.parse reviver context.source unavailable; encode id as a string');
  }

  return JSON.parse(json, (key, value, context) => {
    if (key !== 'id') return value;
    if (typeof value !== 'number' || !/^-?(?:0|[1-9]\d*)$/.test(context.source)) {
      throw new TypeError('id must be a JSON integer literal');
    }
    return BigInt(context.source);
  });
}

export function cloneData(value) {
  if (typeof globalThis.structuredClone !== 'function') {
    throw new Error('structuredClone unavailable');
  }
  return globalThis.structuredClone(value);
}

assert.deepEqual([...makeRange(2, 4)], [2, 3, 4]);
assert.throws(() => makeRange(4, 2), RangeError);

assert.throws(() => protectId({ label: 'Ada' }), /own string id/);
assert.throws(() => protectId(Object.create({ id: 'u-1' })), /own string id/);
const protectedRecord = protectId({ id: 'u-1', label: 'Ada' });
protectedRecord.id = 'u-2';
assert.equal(protectedRecord.id, 'u-2');
assert.throws(() => {
  protectedRecord.id = 1;
}, TypeError);
assert.equal(Reflect.get(protectedRecord, 'id'), 'u-2');
assert.throws(() => delete protectedRecord.id, TypeError);
assert.equal(Reflect.deleteProperty(protectedRecord, 'label'), true);

assert.deepEqual(jsonWithBigInt({ amount: 42n }), { amount: 42n });
assert.deepEqual(jsonWithBigInt({ amount: -42n }), { amount: -42n });
assert.throws(() => jsonWithBigInt({ amount: { $bigint: 1 } }), TypeError);
assert.throws(() => jsonWithBigInt({ amount: { $bigint: '0x2' } }), TypeError);
assert.throws(() => jsonWithBigInt({ amount: { $bigint: '01' } }), TypeError);
assert.throws(() => jsonWithBigInt({ amount: { $bigint: '-0' } }), TypeError);
assert.throws(() => jsonWithBigInt({ amount: { $bigint: '1.0' } }), TypeError);
if (supportsJsonParseSource()) {
  assert.equal(parseExactId('{"id":9007199254740993}').id, 9007199254740993n);
} else {
  assert.throws(() => parseExactId('{"id":1}'), /context\.source/);
}

const original = { date: new Date('2026-01-01'), map: new Map([['x', 1]]) };
const clone = cloneData(original);
assert.notStrictEqual(clone, original);
assert.equal(clone.date instanceof Date, true);
assert.equal(clone.map.get('x'), 1);
