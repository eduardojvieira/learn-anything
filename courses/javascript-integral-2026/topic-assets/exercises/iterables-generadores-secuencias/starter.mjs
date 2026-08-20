import assert from 'node:assert/strict';

/** Devuelve si value cumple el protocolo iterable síncrono, sin consumirlo. */
export function isIterable(value) {
  // TODO: rechazar null/undefined y exigir Symbol.iterator callable.
}

/** Delega cada página iterable y toma hasta limit valores, sin pedir páginas si limit es cero. */
export function* takePages(pages, limit) {
  // TODO: validar limit entero no negativo, usar yield* y detenerse en limit.
}

/** Recolecta iterables síncronos o asíncronos; for await...of también adapta el síncrono. */
export async function collectAsync(source) {
  // TODO: validar una fuente iterable/asíncrona y devolver sus valores en orden.
}

/** Duplica pares y toma dos; usa Iterator Helpers si el runtime los ofrece, o un loop incremental. */
export function firstDoubledPairs(values) {
  // TODO: feature detection de Iterator.from y fallback incremental equivalente.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
assert.equal(isIterable('sol'), true);
assert.equal(isIterable({}), false);
assert.deepEqual([...takePages([[1, 2], [3]], 2)], [1, 2]);
let pagePulls = 0;
function* pages() {
  pagePulls++;
  yield [1];
}
assert.deepEqual([...takePages(pages(), 0)], []);
assert.equal(pagePulls, 0);
assert.deepEqual(
  await collectAsync(
    (async function* () {
      yield 'a';
    })(),
  ),
  ['a'],
);
assert.deepEqual(firstDoubledPairs([1, 2, 3]), [2, 4]);
const savedIterator = globalThis.Iterator;
try {
  globalThis.Iterator = undefined;
  let valuePulls = 0;
  function* values() {
    for (const value of [1, 2, 4, 6]) {
      valuePulls++;
      yield value;
    }
  }
  assert.deepEqual(firstDoubledPairs(values()), [4, 8]);
  assert.equal(valuePulls, 3);
} finally {
  globalThis.Iterator = savedIterator;
}
