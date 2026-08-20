import assert from 'node:assert/strict';

/** Agrupa valores por clave y rechaza una clave existente con valor no-array. */
export function addToBucket(map, key, value) {
  if (!(map instanceof Map)) throw new TypeError('map debe ser un Map');
  const makeBucket = () => [];
  const bucket =
    typeof map.getOrInsertComputed === 'function'
      ? map.getOrInsertComputed(key, makeBucket)
      : map.has(key)
        ? map.get(key)
        : (map.set(key, makeBucket()), map.get(key));
  if (!Array.isArray(bucket))
    throw new TypeError('La clave ya existe con un valor que no es array');
  bucket.push(value);
  return bucket;
}

/** Une dos conjuntos sin mutar ninguno; usa el álgebra ES2025 cuando está disponible. */
export function unionTags(left, right) {
  if (!(left instanceof Set) || !(right instanceof Set))
    throw new TypeError('left y right deben ser Set');
  return typeof left.union === 'function' ? left.union(right) : new Set([...left, ...right]);
}

/** Usa WeakMap para contar objetos o Symbols no registrados sin enumerarlos. */
export function markSeen(seen, value) {
  if (!(seen instanceof WeakMap)) throw new TypeError('seen debe ser un WeakMap');
  const canBeHeldWeakly =
    (typeof value === 'object' && value !== null) ||
    typeof value === 'function' ||
    (typeof value === 'symbol' && Symbol.keyFor(value) === undefined);
  if (!canBeHeldWeakly)
    throw new TypeError('value debe ser objeto, función o Symbol no registrado');
  const count = (seen.get(value) ?? 0) + 1;
  seen.set(value, count);
  return count;
}

const buckets = new Map();
assert.deepEqual(addToBucket(buckets, 'curso', 'arrays'), ['arrays']);
assert.deepEqual(addToBucket(buckets, 'curso', 'map'), ['arrays', 'map']);
assert.strictEqual(buckets.get('curso'), addToBucket(buckets, 'curso', 'set'));
assert.deepEqual(buckets.get('curso'), ['arrays', 'map', 'set']);
assert.throws(() => addToBucket(new Map([['x', 1]]), 'x', 'y'), TypeError);
assert.throws(() => addToBucket(new Map([['x', undefined]]), 'x', 'y'), TypeError);
assert.throws(() => addToBucket({}, 'x', 'y'), TypeError);
const fallbackBuckets = new Map();
Object.defineProperty(fallbackBuckets, 'getOrInsertComputed', { value: undefined });
const fallbackBucket = addToBucket(fallbackBuckets, 'curso', 'arrays');
assert.strictEqual(fallbackBucket, addToBucket(fallbackBuckets, 'curso', 'map'));
assert.deepEqual(fallbackBucket, ['arrays', 'map']);

const left = new Set(['js', 'web']);
const right = new Set(['web', 'node']);
const combined = unionTags(left, right);
assert.deepEqual([...combined], ['js', 'web', 'node']);
assert.notStrictEqual(combined, left);
assert.deepEqual([...left], ['js', 'web']);
assert.deepEqual([...right], ['web', 'node']);
assert.throws(() => unionTags(left, []), TypeError);
const fallbackLeft = new Set(['js', 'web']);
Object.defineProperty(fallbackLeft, 'union', { value: undefined });
const fallbackUnion = unionTags(fallbackLeft, right);
assert.deepEqual([...fallbackUnion], ['js', 'web', 'node']);
assert.notStrictEqual(fallbackUnion, fallbackLeft);
assert.deepEqual([...fallbackLeft], ['js', 'web']);

const seen = new WeakMap();
const item = {};
assert.equal(markSeen(seen, item), 1);
assert.equal(markSeen(seen, item), 2);
assert.equal(seen.get(item), 2);
assert.equal(
  markSeen(seen, () => {}),
  1,
);
const localSymbol = Symbol('local');
assert.equal(markSeen(seen, localSymbol), 1);
assert.equal(markSeen(seen, localSymbol), 2);
assert.equal(seen.get(localSymbol), 2);
assert.throws(() => markSeen(seen, Symbol.for('registered')), TypeError);
for (const primitive of [null, 0, 'id', true, undefined, 1n])
  assert.throws(() => markSeen(seen, primitive), TypeError);
assert.throws(() => markSeen(new Map(), item), TypeError);
