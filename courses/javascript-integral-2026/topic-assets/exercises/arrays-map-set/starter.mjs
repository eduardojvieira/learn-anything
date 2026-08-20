import assert from 'node:assert/strict';

/** Agrupa valores por clave y rechaza una clave existente con valor no-array. */
export function addToBucket(map, key, value) {
  // TODO: validar Map, usar getOrInsertComputed si existe y un fallback correcto si no.
}

/** Une dos conjuntos sin mutar ninguno, incluso si Set.prototype.union no existe. */
export function unionTags(left, right) {
  // TODO: validar Set y detectar el método ES2025 antes de usarlo.
}

/** Usa WeakMap para contar objetos o Symbols no registrados sin enumerarlos. */
export function markSeen(seen, value) {
  // TODO: aceptar objetos/funciones y Symbol() local; rechazar Symbol.for() y otros primitivos.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const buckets = new Map();
assert.deepEqual(addToBucket(buckets, 'curso', 'arrays'), ['arrays']);
assert.deepEqual(addToBucket(buckets, 'curso', 'map'), ['arrays', 'map']);
const a = new Set(['js', 'web']);
const b = new Set(['web', 'node']);
assert.deepEqual([...unionTags(a, b)], ['js', 'web', 'node']);
assert.deepEqual([...a], ['js', 'web']);
const seen = new WeakMap();
const item = {};
assert.equal(markSeen(seen, item), 1);
assert.equal(markSeen(seen, item), 2);
assert.equal(markSeen(seen, Symbol('local')), 1);
assert.throws(() => markSeen(seen, Symbol.for('registered')), TypeError);
assert.throws(() => markSeen(seen, 1), TypeError);
