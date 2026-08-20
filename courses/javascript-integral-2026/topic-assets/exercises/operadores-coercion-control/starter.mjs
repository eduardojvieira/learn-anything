import assert from 'node:assert/strict';
/** Acepta Number entero o string decimal canónico /^[1-9]\d*$/, rango 1..65535. */
export function toPort(value) {
  /* TODO: TypeError por representación, RangeError por entero/rango */
}
/** SameValueZero: === salvo que ambos sean NaN. */
export function sameValueZero(a, b) {
  /* TODO */
}
/** Retorna {results, processed, status}; cleanup recibe {processed,status} y DEBE completar normalmente: throw en finally reemplaza el resultado/error pendiente. */
export function executePlan(commands, handler, cleanup) {
  /* TODO */
}
// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
assert.equal(toPort('3000'), 3000);
assert.equal(sameValueZero(NaN, NaN), true);
assert.equal(sameValueZero(0, '0'), false);
assert.throws(() => toPort(true), TypeError);
assert.throws(() => toPort(0), RangeError);
const report = executePlan(
  [{ kind: 'run', payload: 2 }],
  (n) => n * 2,
  () => {},
);
assert.deepEqual(report, { results: [4], processed: 1, status: 'completed' });
