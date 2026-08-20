import assert from 'node:assert/strict';

/** Encapsula estado por closure sin exponer el objeto de estado. */
export function createLedger(initial = 0) {
  if (!Number.isFinite(initial)) throw new TypeError('initial debe ser un número finito');
  let balance = initial;
  return {
    credit(amount) {
      if (!Number.isFinite(amount)) throw new TypeError('amount debe ser un número finito');
      const next = balance + amount;
      if (!Number.isFinite(next)) throw new RangeError('balance excede el rango finito');
      balance = next;
      return balance;
    },
    read() {
      return balance;
    },
    snapshot() {
      return { balance };
    },
  };
}

/** Simula un borde de import() con una allowlist de formatos. */
export async function loadFormatter(name) {
  const formatters = { plain: (value) => String(value), ars: (value) => `$${value}` };
  if (!Object.hasOwn(formatters, name)) throw new RangeError('formato no público');
  return formatters[name];
}

/** Resuelve sólo la API pública de un paquete según import o require. */
export function resolvePublicEntry(subpath, condition) {
  const entries = {
    '.': { import: './index.mjs', require: './index.cjs' },
    './format': { import: './format.mjs', require: './format.cjs' },
  };
  if (!Object.hasOwn(entries, subpath) || !Object.hasOwn(entries[subpath], condition))
    throw new RangeError('subpath o condición no públicos');
  return entries[subpath][condition];
}

const ledger = createLedger(10);
assert.equal(ledger.read(), 10);
assert.equal(ledger.credit(5), 15);
const snapshot = ledger.snapshot();
snapshot.balance = 0;
assert.equal(ledger.read(), 15);
assert.throws(() => createLedger(Infinity), TypeError);
assert.throws(() => ledger.credit(NaN), TypeError);
const overflowing = createLedger(Number.MAX_VALUE);
assert.throws(() => overflowing.credit(Number.MAX_VALUE), RangeError);
assert.equal(overflowing.read(), Number.MAX_VALUE);
assert.equal((await loadFormatter('plain'))(12), '12');
assert.equal((await loadFormatter('ars'))(12), '$12');
await assert.rejects(loadFormatter('archivo'), RangeError);
assert.equal(resolvePublicEntry('.', 'import'), './index.mjs');
assert.equal(resolvePublicEntry('.', 'require'), './index.cjs');
assert.equal(resolvePublicEntry('./format', 'import'), './format.mjs');
assert.throws(() => resolvePublicEntry('./interno', 'import'), RangeError);
assert.throws(() => resolvePublicEntry('.', 'browser'), RangeError);
