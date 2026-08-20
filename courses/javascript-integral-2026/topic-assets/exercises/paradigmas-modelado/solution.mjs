import assert from 'node:assert/strict';

const transitions = {
  draft: { pay: 'paid' },
  paid: { ship: 'shipped' },
  shipped: {},
};

export function createOrder(total) {
  if (!Number.isFinite(total) || total <= 0) throw new RangeError('total must be positive');
  return { total, status: 'draft', listeners: new Set() };
}

export function transition(order, event) {
  const nextStatus = transitions[order.status]?.[event];
  if (!nextStatus) throw new RangeError(`cannot ${event} from ${order.status}`);
  const next = { ...order, status: nextStatus };
  for (const listener of order.listeners) listener(next);
  return next;
}

export function deriveLabel(order) {
  return { draft: 'Borrador', paid: 'Cobrado', shipped: 'Enviado' }[order.status];
}

export function subscribe(order, listener) {
  if (typeof listener !== 'function') throw new TypeError('listener must be a function');
  order.listeners.add(listener);
  return () => order.listeners.delete(listener);
}

const order = createOrder(25);
let observed;
let notifications = 0;
const unsubscribe = subscribe(order, (next) => {
  observed = next.status;
  notifications += 1;
});
const paid = transition(order, 'pay');
assert.equal(order.status, 'draft');
assert.equal(paid.status, 'paid');
assert.equal(deriveLabel(paid), 'Cobrado');
assert.equal(observed, 'paid');
assert.equal(notifications, 1);
assert.throws(() => createOrder(0), RangeError);
assert.throws(() => transition(paid, 'pay'), RangeError);
assert.equal(unsubscribe(), true);
const shipped = transition(paid, 'ship');
assert.equal(shipped.status, 'shipped');
assert.equal(notifications, 1);
const failingOrder = createOrder(1);
subscribe(failingOrder, () => {
  throw new Error('listener failed');
});
assert.throws(() => transition(failingOrder, 'pay'), /listener failed/);
