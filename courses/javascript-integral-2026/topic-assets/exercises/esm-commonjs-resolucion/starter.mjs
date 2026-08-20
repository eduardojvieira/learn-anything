import assert from 'node:assert/strict';

/** Encapsula estado por closure sin exponer el objeto de estado. */
export function createLedger(initial = 0) {
  // TODO: validar, mantener saldo privado finito y devolver credit/read/snapshot.
}

/** Simula un borde de import() con una allowlist de formatos. */
export async function loadFormatter(name) {
  // TODO: aceptar sólo plain o ars y devolver un formateador async.
}

/** Resuelve sólo la API pública de un paquete según import o require. */
export function resolvePublicEntry(subpath, condition) {
  // TODO: no emular Node: consultar esta tabla mínima y rechazar lo privado.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const ledger = createLedger(10);
assert.equal(ledger.credit(5), 15);
assert.equal(ledger.read(), 15);
assert.deepEqual(ledger.snapshot(), { balance: 15 });
const overflowing = createLedger(Number.MAX_VALUE);
assert.throws(() => overflowing.credit(Number.MAX_VALUE), RangeError);
assert.equal(overflowing.read(), Number.MAX_VALUE);
assert.equal((await loadFormatter('ars'))(12), '$12');
assert.equal(resolvePublicEntry('.', 'import'), './index.mjs');
assert.equal(resolvePublicEntry('./format', 'require'), './format.cjs');
