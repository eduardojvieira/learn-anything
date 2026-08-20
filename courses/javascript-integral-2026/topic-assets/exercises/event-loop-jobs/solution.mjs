import assert from 'node:assert/strict';

/** Ejecuta una tarea completa y después drena microtasks FIFO hasta vaciar la cola. */
export function runTurn(task, microtasks, trace) {
  if (typeof task !== 'function' || !Array.isArray(microtasks) || !Array.isArray(trace))
    throw new TypeError('task, microtasks y trace válidos son requeridos');
  if (!microtasks.every((microtask) => typeof microtask === 'function'))
    throw new TypeError('Cada microtask inicial debe ser una función');
  task();
  while (microtasks.length > 0) {
    const microtask = microtasks.shift();
    if (typeof microtask !== 'function') throw new TypeError('Cada microtask debe ser una función');
    microtask();
  }
}

/** Devuelve true sólo si se puede ceder una tarea sin perder trabajo pendiente. */
export function shouldYield({ processed, budget, pending }) {
  if (
    ![processed, budget, pending].every(Number.isSafeInteger) ||
    processed < 0 ||
    budget < 0 ||
    pending < 0
  )
    throw new RangeError('processed, budget y pending deben ser enteros seguros no negativos');
  return processed >= budget && pending > 0;
}

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
assert.deepEqual(microtasks, []);

const secondTrace = [];
runTurn(
  () => secondTrace.push('timer-task'),
  [() => secondTrace.push('microtask-a'), () => secondTrace.push('microtask-b')],
  secondTrace,
);
assert.deepEqual(secondTrace, ['timer-task', 'microtask-a', 'microtask-b']);
assert.throws(() => runTurn(null, [], []), TypeError);
assert.throws(() => runTurn(() => {}, [1], []), TypeError);
const rejectedTrace = [];
assert.throws(() => runTurn(() => rejectedTrace.push('task'), [42], rejectedTrace), TypeError);
assert.deepEqual(rejectedTrace, []);

assert.equal(shouldYield({ processed: 3, budget: 3, pending: 1 }), true);
assert.equal(shouldYield({ processed: 4, budget: 3, pending: 1 }), true);
assert.equal(shouldYield({ processed: 2, budget: 3, pending: 1 }), false);
assert.equal(shouldYield({ processed: 3, budget: 3, pending: 0 }), false);
for (const input of [
  { processed: -1, budget: 3, pending: 1 },
  { processed: 1.5, budget: 3, pending: 1 },
  { processed: 1, budget: 3, pending: Infinity },
])
  assert.throws(() => shouldYield(input), RangeError);
