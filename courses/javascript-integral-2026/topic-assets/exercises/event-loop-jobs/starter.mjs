import assert from 'node:assert/strict';

/** Valida la cola inicial, ejecuta una tarea completa y después drena microtasks FIFO hasta vaciarla. */
export function runTurn(task, microtasks, trace) {
  // TODO: validar toda la cola inicial antes de task; al drenar, validar también microtasks agregadas después.
}

/** Devuelve true sólo si se puede ceder una tarea sin perder trabajo pendiente. */
export function shouldYield({ processed, budget, pending }) {
  // TODO: validar enteros no negativos; cedé al agotar budget si queda trabajo.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const trace = [];
const microtasks = [() => trace.push('promise')];
runTurn(
  () => {
    trace.push('task');
    microtasks.push(() => trace.push('nested'));
  },
  microtasks,
  trace,
);
assert.deepEqual(trace, ['task', 'promise', 'nested']);
const rejectedTrace = [];
assert.throws(() => runTurn(() => rejectedTrace.push('task'), [42], rejectedTrace), TypeError);
assert.deepEqual(rejectedTrace, []);
assert.equal(shouldYield({ processed: 3, budget: 3, pending: 1 }), true);
assert.equal(shouldYield({ processed: 2, budget: 3, pending: 1 }), false);
