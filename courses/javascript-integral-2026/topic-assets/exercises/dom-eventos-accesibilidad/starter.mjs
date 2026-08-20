import assert from 'node:assert/strict';

/** Registra acciones en un EventTarget y devuelve una función de limpieza. */
export function installActionRouter(target, onAction, signal) {
  // TODO: validar el contrato, ignorar acciones ajenas y usar signal para abortar.
}

/** Modelo de la validación que haría un formulario accesible antes de enviar. */
export function validateNewsletter({ email, acceptedTerms }) {
  // TODO: devolver { valid, errors }; no usar el placeholder como etiqueta.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const target = new EventTarget();
const actions = [];
const stop = installActionRouter(target, (action) => actions.push(action));
const event = new Event('action');
Object.defineProperty(event, 'action', { value: 'save' });
target.dispatchEvent(event);
stop();
const afterStop = new Event('action');
Object.defineProperty(afterStop, 'action', { value: 'delete' });
target.dispatchEvent(afterStop);
assert.deepEqual(actions, ['save']);
assert.deepEqual(validateNewsletter({ email: 'ana@example.com', acceptedTerms: true }), {
  valid: true,
  errors: {},
});
