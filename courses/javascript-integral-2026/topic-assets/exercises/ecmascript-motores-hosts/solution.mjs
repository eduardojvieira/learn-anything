import assert from 'node:assert/strict';

const layers = new Set(['language', 'engine', 'host']);

/** @typedef {'language'|'engine'|'host'} Layer */
/** @typedef {{name: string, layer: Layer, probe: () => boolean, fallback?: string}} Capability */

/** @param {unknown} item */
function validate(item) {
  if (item === null || typeof item !== 'object')
    throw new TypeError('La capacidad debe ser un objeto');
  const value = /** @type {Record<string, unknown>} */ (item);
  if (typeof value.name !== 'string' || value.name.trim() === '')
    throw new TypeError('name debe ser un texto no vacío');
  if (typeof value.layer !== 'string' || !layers.has(value.layer))
    throw new TypeError('layer debe ser language, engine u host');
  if (typeof value.probe !== 'function') throw new TypeError('probe debe ser una función');
  if ('fallback' in value && (typeof value.fallback !== 'string' || value.fallback.trim() === ''))
    throw new TypeError('fallback debe ser un texto no vacío');
}

/** @param {unknown} error */
function describeThrown(error) {
  return error instanceof Error ? error.message : String(error);
}

/** @param {Capability} item */
export function inspectCapability(item) {
  validate(item);
  try {
    const result = item.probe();
    if (typeof result !== 'boolean')
      return {
        name: item.name,
        layer: item.layer,
        status: 'error',
        error: 'probe debe devolver boolean',
      };
    return {
      name: item.name,
      layer: item.layer,
      status: result ? 'available' : 'missing',
      fallback: item.fallback,
    };
  } catch (cause) {
    return {
      name: item.name,
      layer: item.layer,
      status: 'error',
      error: describeThrown(cause),
      cause,
      fallback: item.fallback,
    };
  }
}

/** @param {Capability} item */
export function requireCapability(item) {
  const report = inspectCapability(item);
  if (report.status === 'available') return report;
  const error = new Error(`Capacidad ${report.name}: ${report.status}`);
  if ('cause' in report) error.cause = report.cause;
  throw error;
}

/** @param {readonly Capability[]} items */
export function capabilityMatrix(items) {
  return items
    .map((item, index) => ({ ...inspectCapability(item), index }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.index - b.index))
    .map(({ index, ...report }) => report);
}

assert.equal(
  inspectCapability({ name: 'Map', layer: 'language', probe: () => typeof Map === 'function' })
    .status,
  'available',
);
assert.equal(
  inspectCapability({ name: 'camera', layer: 'host', probe: () => false }).status,
  'missing',
);
assert.equal(
  inspectCapability({
    name: 'broken',
    layer: 'engine',
    probe: () => {
      throw new Error('boom');
    },
  }).error,
  'boom',
);
assert.equal(
  inspectCapability({
    name: 'string-throw',
    layer: 'host',
    probe: () => {
      throw 'offline';
    },
  }).error,
  'offline',
);
for (const bad of [
  null,
  { name: '', layer: 'host', probe: () => true },
  { name: 'x', layer: 'no', probe: () => true },
  { name: 'x', layer: 'host', probe: true },
  { name: 'x', layer: 'host', probe: () => true, fallback: 42 },
  { name: 'x', layer: 'host', probe: () => true, fallback: '' },
])
  assert.throws(() => inspectCapability(bad), TypeError);
assert.equal(
  inspectCapability({ name: 'bad return', layer: 'host', probe: () => 'yes' }).status,
  'error',
);
assert.equal(
  inspectCapability({ name: 'legacy', layer: 'host', probe: () => false, fallback: 'formulario' })
    .fallback,
  'formulario',
);
let caused;
try {
  requireCapability({
    name: 'db',
    layer: 'host',
    probe: () => {
      throw 'closed';
    },
  });
} catch (error) {
  caused = error;
}
assert.match(caused.message, /db: error/);
assert.equal(caused.cause, 'closed');
const input = Object.freeze([
  Object.freeze({ name: 'z', layer: 'host', probe: () => true }),
  Object.freeze({ name: 'á', layer: 'engine', probe: () => true }),
  Object.freeze({ name: 'a', layer: 'engine', probe: () => true }),
  Object.freeze({ name: 'a', layer: 'host', probe: () => false }),
]);
assert.deepEqual(
  capabilityMatrix(input).map(({ name, status }) => [name, status]),
  [
    ['a', 'available'],
    ['a', 'missing'],
    ['z', 'available'],
    ['á', 'available'],
  ],
);
assert.deepEqual(
  input.map((item) => [item.name, item.layer]),
  [
    ['z', 'host'],
    ['á', 'engine'],
    ['a', 'engine'],
    ['a', 'host'],
  ],
);
