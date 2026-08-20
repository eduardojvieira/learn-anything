import assert from 'node:assert/strict';

/** Factory con DI. transport recibe {message, sentAt}; clock devuelve el instante serializable. */
export function createNotifier({ transport, clock }) {
  if (typeof transport !== 'function' || typeof clock !== 'function')
    throw new TypeError('transport y clock deben ser funciones');
  return {
    send(message) {
      if (typeof message !== 'string' || message.trim() === '')
        throw new TypeError('message debe ser texto no vacío');
      return transport({ message, sentAt: clock() });
    },
  };
}

/** Compone middleware sync (context, next) con terminal(context); next sólo puede llamarse una vez. */
export function composeMiddleware(middlewares, terminal) {
  if (
    !Array.isArray(middlewares) ||
    typeof terminal !== 'function' ||
    middlewares.some((fn) => typeof fn !== 'function')
  )
    throw new TypeError('middlewares y terminal deben ser funciones válidas');
  return middlewares.reduceRight(
    (next, middleware) => (context) => {
      let called = false;
      return middleware(context, (nextContext) => {
        if (called) throw new Error('next sólo puede llamarse una vez');
        called = true;
        return next(nextContext);
      });
    },
    terminal,
  );
}

/** Bus local: listeners duplicados devuelven unsubscribe no-op; emit usa snapshot de listeners. */
export function createEventBus() {
  const listeners = new Map();
  return {
    on(event, listener) {
      if (typeof event !== 'string' || event === '' || typeof listener !== 'function')
        throw new TypeError('event y listener válidos son requeridos');
      const subscribers = listeners.get(event) ?? new Set();
      if (subscribers.has(listener)) return () => {};
      listeners.set(event, subscribers);
      subscribers.add(listener);
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        subscribers.delete(listener);
        if (subscribers.size === 0) listeners.delete(event);
      };
    },
    emit(event, payload) {
      if (typeof event !== 'string' || event === '')
        throw new TypeError('event debe ser texto no vacío');
      for (const listener of [...(listeners.get(event) ?? [])]) listener(payload);
    },
  };
}

const sent = [];
const notifier = createNotifier({
  transport: (message) => sent.push(message),
  clock: () => '2026-08-20T12:00:00Z',
});
assert.equal(notifier.send('hola'), 1);
assert.deepEqual(sent, [{ message: 'hola', sentAt: '2026-08-20T12:00:00Z' }]);
assert.throws(() => createNotifier({ transport: null, clock: () => '' }), TypeError);
assert.throws(() => notifier.send('  '), TypeError);

const trace = [];
const pipeline = composeMiddleware(
  [
    (ctx, next) => {
      trace.push('auth');
      return next({ ...ctx, actor: 'ana' });
    },
    (ctx, next) => {
      trace.push('audit');
      return next({ ...ctx, audited: true });
    },
  ],
  (ctx) => ({ ...ctx, status: 'sent' }),
);
assert.deepEqual(pipeline({ id: 1 }), { id: 1, actor: 'ana', audited: true, status: 'sent' });
assert.deepEqual(trace, ['auth', 'audit']);
assert.throws(
  () => composeMiddleware([(ctx, next) => (next(ctx), next(ctx))], (ctx) => ctx)({}),
  /una vez/,
);
assert.throws(() => composeMiddleware([null], () => {}), TypeError);

const bus = createEventBus();
const duplicateBus = createEventBus();
let duplicateCalls = 0;
const duplicatedListener = () => duplicateCalls++;
const unsubscribeOriginal = duplicateBus.on('saved', duplicatedListener);
const unsubscribeDuplicate = duplicateBus.on('saved', duplicatedListener);
unsubscribeDuplicate();
duplicateBus.emit('saved', { id: 0 });
assert.equal(duplicateCalls, 1);
unsubscribeOriginal();
duplicateBus.emit('saved', { id: 0 });
assert.equal(duplicateCalls, 1);

const events = [];
const second = (payload) => events.push(`second:${payload.id}`);
const unsubscribeFirst = bus.on('saved', (payload) => {
  events.push(`first:${payload.id}`);
  unsubscribeSecond();
});
const unsubscribeSecond = bus.on('saved', second);
bus.emit('saved', { id: 1 });
assert.deepEqual(events, ['first:1', 'second:1']);
bus.emit('saved', { id: 2 });
assert.deepEqual(events, ['first:1', 'second:1', 'first:2']);
unsubscribeFirst();
unsubscribeFirst();
bus.emit('saved', { id: 3 });
assert.deepEqual(events, ['first:1', 'second:1', 'first:2']);
assert.throws(() => bus.on('', () => {}), TypeError);
assert.throws(() => bus.on('saved', null), TypeError);
assert.throws(() => bus.emit(''), TypeError);
