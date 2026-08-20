import assert from 'node:assert/strict';

// Contrato: la API protege las transiciones válidas, pero status y listeners
// siguen siendo observables; un listener que lanza interrumpe la entrega.
export function createOrder(total) {
  // TODO: validar total finito y mayor que cero; modelar el estado y responsabilidades.
}

export function transition(order, event) {
  // TODO: aplicar la máquina draft -> paid -> shipped sin mutar la orden previa.
}

export function deriveLabel(order) {
  // TODO: derivar una etiqueta del estado; no guardarla como estado duplicado.
}

export function subscribe(order, listener) {
  // TODO: registrar listener y devolver una desuscripción.
}

const order = createOrder(25);
let notifications = 0;
const unsubscribe = subscribe(order, () => {
  notifications += 1;
});
const paid = transition(order, 'pay');
assert.equal(order.status, 'draft');
assert.equal(paid.status, 'paid');
assert.equal(deriveLabel(paid), 'Cobrado');
assert.equal(notifications, 1);
unsubscribe();
transition(paid, 'ship');
assert.equal(notifications, 1);
