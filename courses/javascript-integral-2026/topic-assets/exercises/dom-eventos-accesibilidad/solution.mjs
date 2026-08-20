import assert from 'node:assert/strict';

/** Registra acciones delegadas en un EventTarget; el Event de Node modela el dato con `action`. */
export function installActionRouter(target, onAction, signal) {
  if (!(target instanceof EventTarget) || typeof onAction !== 'function')
    throw new TypeError('target debe ser EventTarget y onAction una función');
  if (signal !== undefined && !(signal instanceof AbortSignal))
    throw new TypeError('signal debe ser AbortSignal');
  const listener = (event) => {
    if (typeof event.action === 'string' && event.action !== '') onAction(event.action);
  };
  target.addEventListener('action', listener, { signal });
  return () => target.removeEventListener('action', listener);
}

/** Modelo de la validación nativa: los mensajes se asocian al control mediante label y aria-describedby. */
export function validateNewsletter({ email, acceptedTerms }) {
  const errors = {};
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email))
    errors.email = 'Ingresá un email válido.';
  if (acceptedTerms !== true) errors.acceptedTerms = 'Tenés que aceptar los términos.';
  return { valid: Object.keys(errors).length === 0, errors };
}

function actionEvent(action) {
  const event = new Event('action');
  Object.defineProperty(event, 'action', { value: action });
  return event;
}

const target = new EventTarget();
const actions = [];
const controller = new AbortController();
const stop = installActionRouter(target, (action) => actions.push(action), controller.signal);
target.dispatchEvent(actionEvent('save'));
target.dispatchEvent(actionEvent(''));
controller.abort();
target.dispatchEvent(actionEvent('delete'));
assert.deepEqual(actions, ['save']);
stop(); // Idempotente: el listener ya fue removido por abort().
const explicitlyStopped = [];
const explicitTarget = new EventTarget();
const explicitStop = installActionRouter(explicitTarget, (action) =>
  explicitlyStopped.push(action),
);
explicitTarget.dispatchEvent(actionEvent('save'));
explicitStop();
explicitTarget.dispatchEvent(actionEvent('delete'));
assert.deepEqual(explicitlyStopped, ['save']);
assert.deepEqual(validateNewsletter({ email: 'ana@example.com', acceptedTerms: true }), {
  valid: true,
  errors: {},
});
assert.deepEqual(validateNewsletter({ email: 'sin-arroba', acceptedTerms: false }), {
  valid: false,
  errors: {
    email: 'Ingresá un email válido.',
    acceptedTerms: 'Tenés que aceptar los términos.',
  },
});
assert.throws(() => installActionRouter({}, () => {}), TypeError);
assert.throws(() => installActionRouter(new EventTarget(), () => {}, {}), TypeError);
