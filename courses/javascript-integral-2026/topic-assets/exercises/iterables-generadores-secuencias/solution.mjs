import assert from 'node:assert/strict';

/** @param {unknown} value */
export function isIterable(value) {
  return value != null && typeof value[Symbol.iterator] === 'function';
}

/** @param {Iterable<unknown>} page @param {number} remaining */
function* takeFromPage(page, remaining) {
  let taken = 0;
  for (const value of page) {
    yield value;
    if (++taken === remaining) return taken;
  }
  return taken;
}

/** @param {Iterable<Iterable<unknown>>} pages @param {number} limit */
export function* takePages(pages, limit) {
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new RangeError('limit debe ser un entero seguro no negativo');
  if (!isIterable(pages)) throw new TypeError('pages debe ser iterable');
  if (limit === 0) return;
  let taken = 0;
  for (const page of pages) {
    if (!isIterable(page)) throw new TypeError('cada página debe ser iterable');
    taken += yield* takeFromPage(page, limit - taken);
    if (taken === limit) return;
  }
}

/** @param {unknown} source */
export async function collectAsync(source) {
  if (
    source == null ||
    (typeof source[Symbol.iterator] !== 'function' &&
      typeof source[Symbol.asyncIterator] !== 'function')
  )
    throw new TypeError('source debe ser iterable o async iterable');
  const values = [];
  for await (const value of source) values.push(value);
  return values;
}

/** @param {Iterable<number>} values */
export function firstDoubledPairs(values) {
  if (!isIterable(values)) throw new TypeError('values debe ser iterable');
  if (typeof Iterator === 'function' && typeof Iterator.from === 'function')
    return Iterator.from(values)
      .filter((value) => value % 2 === 0)
      .map((value) => value * 2)
      .take(2)
      .toArray();
  const result = [];
  for (const value of values) {
    if (value % 2 !== 0) continue;
    result.push(value * 2);
    if (result.length === 2) return result;
  }
  return result;
}

assert.equal(isIterable('sol'), true);
assert.equal(isIterable(new Map()), true);
assert.equal(isIterable({}), false);
assert.equal(isIterable(null), false);
assert.deepEqual(
  [
    ...takePages(
      [
        [1, 2],
        [3, 4],
      ],
      3,
    ),
  ],
  [1, 2, 3],
);
assert.deepEqual([...takePages([[1], [2]], 0)], []);
let pagePulls = 0;
function* measuredPages() {
  pagePulls++;
  yield [1];
}
assert.deepEqual([...takePages(measuredPages(), 0)], []);
assert.equal(pagePulls, 0);
let pulled = 0;
function* measuredPage() {
  pulled++;
  yield 1;
  pulled++;
  yield 2;
}
assert.deepEqual([...takePages([measuredPage()], 1)], [1]);
assert.equal(pulled, 1);
assert.deepEqual([...takePages([measuredPage()], 0)], []);
assert.equal(pulled, 1);
assert.throws(() => [...takePages([], -1)], RangeError);
assert.throws(() => [...takePages([1], 1)], TypeError);
assert.deepEqual(await collectAsync([1, 2]), [1, 2]);
assert.deepEqual(
  await collectAsync(
    (async function* () {
      yield 'a';
      await Promise.resolve();
      yield 'b';
    })(),
  ),
  ['a', 'b'],
);
await assert.rejects(() => collectAsync({}), TypeError);
assert.deepEqual(firstDoubledPairs([1, 2, 4, 6]), [4, 8]);
assert.deepEqual(firstDoubledPairs(new Set([2, 4, 6])), [4, 8]);
const savedIterator = globalThis.Iterator;
try {
  globalThis.Iterator = undefined;
  let valuePulls = 0;
  function* measuredValues() {
    for (const value of [1, 2, 4, 6]) {
      valuePulls++;
      yield value;
    }
  }
  assert.deepEqual(firstDoubledPairs(measuredValues()), [4, 8]);
  assert.equal(valuePulls, 3);
} finally {
  globalThis.Iterator = savedIterator;
}
assert.throws(() => firstDoubledPairs({}), TypeError);
