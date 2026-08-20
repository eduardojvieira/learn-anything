import assert from 'node:assert/strict';

/** Define una propiedad propia enumerable, de sólo lectura y no configurable. */
export function defineReadOnly(object, key, value) {
  // TODO: validar object y usar un descriptor de datos explícito.
}

/** Conserva Celsius finitos detrás de un getter/setter. */
export function createTemperature(celsius = 0) {
  // TODO: validar el valor inicial y cada asignación antes de guardarla.
}

/** Crea una raíz nueva, conserva el alias anidado y calcula theme con ?. y ??. */
export function updateProfile(profile, patch = {}) {
  // TODO: validar registros, usar destructuring y spread; no mutar profile.
}

/** Sella o congela la raíz; estas operaciones son deliberadamente superficiales. */
export function lockSettings(settings, mode) {
  // TODO: aceptar sólo 'seal' o 'freeze'.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const profile = { preferences: { theme: 'paper' } };
const updated = updateProfile(profile, { name: 'Noa' });
assert.notStrictEqual(updated, profile);
assert.equal(updated.theme, 'paper');
assert.strictEqual(updated.preferences, profile.preferences);
const id = defineReadOnly({}, 'id', 7);
assert.equal(id.id, 7);
assert.throws(() => {
  id.id = 8;
}, TypeError);
const temperature = createTemperature(20);
temperature.celsius = 21;
assert.equal(temperature.celsius, 21);
assert.equal(Object.isFrozen(lockSettings({}, 'freeze')), true);
