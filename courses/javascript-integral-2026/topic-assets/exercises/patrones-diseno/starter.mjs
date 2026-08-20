import assert from 'node:assert/strict';

/** Factory con DI. transport recibe {message, sentAt}; clock devuelve el instante serializable. */
export function createNotifier({ transport, clock }) {
  /* TODO: validar dependencias y texto; retornar { send(message) }. */
}

/** Compone middleware sync (context, next) con terminal(context); next sólo puede llamarse una vez. */
export function composeMiddleware(middlewares, terminal) {
  /* TODO: validar funciones, conservar el contexto devuelto y detectar doble next. */
}

/** Bus local: listeners duplicados devuelven unsubscribe no-op; emit usa snapshot de listeners. */
export function createEventBus() {
  /* TODO: usar Map y Set; rechazar eventos/listeners inválidos. */
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const sent = [];
const notifier = createNotifier({
  transport: (message) => sent.push(message),
  clock: () => '2026-08-20T12:00:00Z',
});
notifier.send('hola');
assert.deepEqual(sent, [{ message: 'hola', sentAt: '2026-08-20T12:00:00Z' }]);
assert.equal(
  composeMiddleware([(ctx, next) => next({ ...ctx, ok: true })], (ctx) => ctx.ok)({}),
  true,
);
const bus = createEventBus();
let received = 0;
bus.on('saved', () => received++);
bus.emit('saved', { id: 1 });
assert.equal(received, 1);
