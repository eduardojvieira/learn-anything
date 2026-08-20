import assert from 'node:assert/strict';

/** @param {unknown} value @param {string} name */
function text(value, name) {
  if (typeof value !== 'string' || value.trim() === '')
    throw new TypeError(`${name} debe ser texto no vacío`);
  return value;
}

/** @param {unknown} command */
export function decideOrderCreated(command) {
  if (command === null || typeof command !== 'object')
    throw new TypeError('command debe ser un objeto');
  const value = /** @type {Record<string, unknown>} */ (command);
  const eventId = text(value.eventId, 'eventId');
  const orderId = text(value.orderId, 'orderId');
  const customerId = text(value.customerId, 'customerId');
  if (!Array.isArray(value.items) || value.items.length === 0)
    throw new RangeError('items debe tener al menos un ítem');
  let totalCents = 0;
  const items = value.items.map((item) => {
    if (item === null || typeof item !== 'object') throw new TypeError('ítem inválido');
    const row = /** @type {Record<string, unknown>} */ (item);
    const sku = text(row.sku, 'sku');
    if (!Number.isSafeInteger(row.quantity) || row.quantity < 1)
      throw new RangeError('quantity debe ser entero positivo seguro');
    if (!Number.isSafeInteger(row.unitPriceCents) || row.unitPriceCents < 0)
      throw new RangeError('unitPriceCents debe ser entero seguro no negativo');
    const lineCents = row.quantity * row.unitPriceCents;
    if (!Number.isSafeInteger(lineCents) || !Number.isSafeInteger(totalCents + lineCents))
      throw new RangeError('totalCents excede el entero seguro');
    totalCents += lineCents;
    return { sku, quantity: row.quantity, unitPriceCents: row.unitPriceCents };
  });
  return {
    id: eventId,
    type: 'order.created',
    version: 1,
    data: { orderId, customerId, items, totalCents },
  };
}

/** @param {unknown} state */
function validState(state) {
  if (state === null || typeof state !== 'object') throw new TypeError('state debe ser un objeto');
  const value = /** @type {Record<string, unknown>} */ (state);
  if (value.orders === null || typeof value.orders !== 'object' || Array.isArray(value.orders))
    throw new TypeError('state.orders debe ser un registro');
  if (
    !Array.isArray(value.appliedEventIds) ||
    !value.appliedEventIds.every((id) => typeof id === 'string')
  )
    throw new TypeError('state.appliedEventIds debe ser un array de textos');
}

/** @param {{orders: Record<string, unknown>, appliedEventIds: readonly string[]}} state @param {unknown} event */
export function applyOrderCreated(state, event) {
  validState(state);
  if (event === null || typeof event !== 'object') throw new TypeError('event debe ser un objeto');
  const value = /** @type {Record<string, unknown>} */ (event);
  if (value.type !== 'order.created' || value.version !== 1)
    throw new RangeError('evento no soportado');
  if (value.data === null || typeof value.data !== 'object' || Array.isArray(value.data))
    throw new TypeError('event.data debe ser un registro');
  const data = /** @type {Record<string, unknown>} */ (value.data);
  const decided = decideOrderCreated({
    orderId: data.orderId,
    customerId: data.customerId,
    items: data.items,
    eventId: value.id,
  });
  if (state.appliedEventIds.includes(decided.id)) return state;
  const { orderId, customerId, items, totalCents } = decided.data;
  if (Object.hasOwn(state.orders, orderId))
    throw new RangeError('orderId ya existe con otro evento');
  return {
    orders: { ...state.orders, [orderId]: { customerId, items, totalCents } },
    appliedEventIds: [...state.appliedEventIds, decided.id],
  };
}

const command = {
  eventId: 'evt-1',
  orderId: 'ord-1',
  customerId: 'cus-1',
  items: [{ sku: 'mate', quantity: 2, unitPriceCents: 1500 }],
};
const event = decideOrderCreated(command);
assert.deepEqual(event, {
  id: 'evt-1',
  type: 'order.created',
  version: 1,
  data: {
    orderId: 'ord-1',
    customerId: 'cus-1',
    items: [{ sku: 'mate', quantity: 2, unitPriceCents: 1500 }],
    totalCents: 3000,
  },
});
assert.deepEqual(command.items, [{ sku: 'mate', quantity: 2, unitPriceCents: 1500 }]);
for (const bad of [
  null,
  {},
  { ...command, items: [] },
  { ...command, items: [{ sku: 'x', quantity: 0, unitPriceCents: 1 }] },
])
  assert.throws(() => decideOrderCreated(bad), /debe|al menos/);
assert.throws(
  () =>
    decideOrderCreated({
      ...command,
      items: [{ sku: 'x', quantity: 2, unitPriceCents: Number.MAX_SAFE_INTEGER }],
    }),
  RangeError,
);
const initial = Object.freeze({ orders: Object.freeze({}), appliedEventIds: Object.freeze([]) });
const projected = applyOrderCreated(initial, event);
assert.deepEqual(projected.orders['ord-1'], {
  customerId: 'cus-1',
  items: [{ sku: 'mate', quantity: 2, unitPriceCents: 1500 }],
  totalCents: 3000,
});
assert.notStrictEqual(projected, initial);
assert.strictEqual(applyOrderCreated(projected, event), projected);
const adulterated = applyOrderCreated(initial, {
  ...event,
  data: { ...event.data, eventId: 'evt-adulterado' },
});
assert.deepEqual(adulterated.appliedEventIds, ['evt-1']);
assert.throws(() => applyOrderCreated(initial, { ...event, data: null }), TypeError);
assert.throws(() => applyOrderCreated(initial, { ...event, type: 'order.cancelled' }), RangeError);
assert.throws(() => applyOrderCreated(initial, { ...event, version: 2 }), RangeError);
assert.throws(
  () => applyOrderCreated({ ...projected, appliedEventIds: [] }, event),
  /orderId ya existe/,
);
