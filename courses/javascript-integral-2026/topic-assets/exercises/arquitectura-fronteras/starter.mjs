import assert from 'node:assert/strict';

/**
 * Core funcional: valida un comando y decide un evento serializable.
 * No genera IDs, no lee el reloj y no publica: esas son responsabilidades del borde.
 * @param {unknown} command
 */
export function decideOrderCreated(command) {
  // TODO: validar eventId, orderId, customerId e items; devolver un evento order.created v1.
}

/**
 * Proyección de lectura: no muta state. Repetir el mismo eventId debe devolver el mismo state.
 * @param {{orders: Record<string, unknown>, appliedEventIds: readonly string[]}} state
 * @param {unknown} event
 */
export function applyOrderCreated(state, event) {
  // TODO: validar state, event.data record y evento; aplicar sólo order.created v1 y conservar idempotencia.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const event = decideOrderCreated({
  eventId: 'evt-1',
  orderId: 'ord-1',
  customerId: 'cus-1',
  items: [{ sku: 'mate', quantity: 2, unitPriceCents: 1500 }],
});
assert.equal(event.data.totalCents, 3000);
const initial = { orders: {}, appliedEventIds: [] };
const projected = applyOrderCreated(initial, event);
assert.equal(projected.orders['ord-1'].totalCents, 3000);
assert.strictEqual(applyOrderCreated(projected, event), projected);
