import assert from 'node:assert/strict';

/** Acepta Number entero o string decimal canónico /^[1-9]\d*$/, rango 1..65535. */
export function toPort(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value))
      throw new RangeError('El puerto Number debe ser entero finito');
    if (value < 1 || value > 65535) throw new RangeError('Puerto fuera de rango');
    return value;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value))
    throw new TypeError('El puerto debe ser Number entero o decimal canónico');
  const port = Number(value);
  if (port < 1 || port > 65535) throw new RangeError('Puerto fuera de rango');
  return port;
}
export function sameValueZero(a, b) {
  return a === b || (Number.isNaN(a) && Number.isNaN(b));
}

/** Retorna {results, processed, status}; cleanup recibe {processed,status} una vez tras comenzar el plan. */
export function executePlan(commands, handler, cleanup) {
  if (!Array.isArray(commands) || typeof handler !== 'function' || typeof cleanup !== 'function')
    throw new TypeError('commands, handler y cleanup válidos son requeridos');
  let processed = 0;
  let status = 'completed';
  try {
    const results = [];
    for (const command of commands) {
      processed++;
      if (command === null || typeof command !== 'object') throw new TypeError('Comando inválido');
      switch (command.kind) {
        case 'skip':
          continue;
        case 'stop':
          results.push('stopped');
          status = 'stopped';
          break;
        case 'run': {
          const payload = command.payload;
          let result;
          try {
            result = handler(payload);
          } catch (cause) {
            throw new Error('Falló el handler del plan', { cause });
          }
          results.push(result);
          continue;
        }
        default:
          throw new RangeError(`Comando desconocido: ${String(command.kind)}`);
      }
      break;
    }
    return { results, processed, status };
  } catch (error) {
    status = 'failed';
    throw error;
  } finally {
    cleanup({ processed, status }); // No debe lanzar: ocultaría la finalización pendiente.
  }
}

for (const [value, expected] of [
  [1, 1],
  [65535, 65535],
  ['3000', 3000],
])
  assert.equal(toPort(value), expected);
for (const value of [true, '', ' ', '01', '0x10', '1e3', '1.5'])
  assert.throws(() => toPort(value), TypeError);
for (const value of [0, -0, 65536, 1.5, Infinity, NaN, '65536'])
  assert.throws(() => toPort(value), RangeError);
assert.equal(sameValueZero(NaN, NaN), true);
assert.equal(sameValueZero(-0, 0), true);
assert.equal(sameValueZero(0, '0'), false);
assert.equal(sameValueZero(null, undefined), false);
const one = {},
  two = {};
assert.equal(sameValueZero(one, two), false);
assert.equal(sameValueZero(one, one), true);
let reports = [];
assert.deepEqual(
  executePlan(
    [{ kind: 'run', payload: 2 }, { kind: 'skip' }, { kind: 'run', payload: 3 }],
    (n) => n * 2,
    (report) => reports.push(report),
  ),
  { results: [4, 6], processed: 3, status: 'completed' },
);
assert.deepEqual(reports, [{ processed: 3, status: 'completed' }]);
reports = [];
assert.deepEqual(
  executePlan(
    [{ kind: 'run', payload: 1 }, { kind: 'stop' }, { kind: 'run', payload: 9 }],
    (n) => n,
    (report) => reports.push(report),
  ),
  { results: [1, 'stopped'], processed: 2, status: 'stopped' },
);
assert.deepEqual(reports, [{ processed: 2, status: 'stopped' }]);
reports = [];
assert.throws(
  () =>
    executePlan(
      [{ kind: 'wat' }],
      () => 1,
      (report) => reports.push(report),
    ),
  RangeError,
);
assert.deepEqual(reports, [{ processed: 1, status: 'failed' }]);
reports = [];
const handlerError = new TypeError('db');
let wrapped;
try {
  executePlan(
    [{ kind: 'run', payload: 1 }],
    () => {
      throw handlerError;
    },
    (report) => reports.push(report),
  );
} catch (error) {
  wrapped = error;
}
assert.match(wrapped.message, /Falló/);
assert.strictEqual(wrapped.cause, handlerError);
assert.equal(wrapped.cause instanceof TypeError, true);
assert.deepEqual(reports, [{ processed: 1, status: 'failed' }]);
reports = [];
const getterError = new SyntaxError('payload');
const getterCommand = {
  kind: 'run',
  get payload() {
    throw getterError;
  },
};
assert.throws(
  () =>
    executePlan(
      [getterCommand],
      () => 1,
      (report) => reports.push(report),
    ),
  (error) => error === getterError,
);
assert.deepEqual(reports, [{ processed: 1, status: 'failed' }]);
reports = [];
assert.throws(
  () =>
    executePlan(
      [null],
      () => 1,
      (report) => reports.push(report),
    ),
  TypeError,
);
assert.deepEqual(reports, [{ processed: 1, status: 'failed' }]);
reports = [];
assert.throws(
  () =>
    executePlan(
      [42],
      () => 1,
      (report) => reports.push(report),
    ),
  TypeError,
);
assert.deepEqual(reports, [{ processed: 1, status: 'failed' }]);
let noCleanup = 0;
assert.throws(() => executePlan([], null, () => noCleanup++), TypeError);
assert.throws(() => executePlan([], () => 1, null), TypeError);
assert.throws(
  () =>
    executePlan(
      {},
      () => 1,
      () => {},
    ),
  TypeError,
);
assert.equal(noCleanup, 0);
const cleanupError = new RangeError('cleanup');
assert.throws(
  () =>
    executePlan(
      [{ kind: 'run', payload: 1 }],
      () => {
        throw new TypeError('primary');
      },
      () => {
        throw cleanupError;
      },
    ),
  (error) => error === cleanupError,
);
