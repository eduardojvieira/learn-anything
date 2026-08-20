import assert from 'node:assert/strict';

/** @param {unknown} value @param {string} name */
function requireRecord(value, name) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError(`${name} debe ser un registro`);
}

/** Define una propiedad propia enumerable, de sólo lectura y no configurable. */
export function defineReadOnly(object, key, value) {
  requireRecord(object, 'object');
  if (typeof key !== 'string' && typeof key !== 'symbol')
    throw new TypeError('key debe ser string o symbol');
  Object.defineProperty(object, key, {
    value,
    enumerable: true,
    writable: false,
    configurable: false,
  });
  return object;
}

/** Conserva Celsius finitos detrás de un getter/setter. */
export function createTemperature(celsius = 0) {
  if (!Number.isFinite(celsius)) throw new TypeError('celsius debe ser finito');
  let value = celsius;
  return {
    get celsius() {
      return value;
    },
    set celsius(next) {
      if (!Number.isFinite(next)) throw new TypeError('celsius debe ser finito');
      value = next;
    },
  };
}

/** Crea una raíz nueva, conserva el alias anidado y calcula theme con ?. y ??. */
export function updateProfile(profile, patch = {}) {
  requireRecord(profile, 'profile');
  requireRecord(patch, 'patch');
  const { preferences, ...identity } = profile;
  return {
    ...identity,
    ...patch,
    preferences,
    theme: preferences?.theme ?? 'system',
  };
}

/** Sella o congela la raíz; estas operaciones son deliberadamente superficiales. */
export function lockSettings(settings, mode) {
  requireRecord(settings, 'settings');
  if (mode === 'seal') return Object.seal(settings);
  if (mode === 'freeze') return Object.freeze(settings);
  throw new RangeError("mode debe ser 'seal' o 'freeze'");
}

const token = Symbol('token');
const record = { 2: 'dos', 10: 'diez', name: 'Ana', [token]: 'interno' };
Object.defineProperty(record, 'hidden', { value: 'no enumerar' });
assert.deepEqual(Object.keys(record), ['2', '10', 'name']);
assert.deepEqual(Reflect.ownKeys(record), ['2', '10', 'name', 'hidden', token]);
assert.deepEqual({ ...record }, { 2: 'dos', 10: 'diez', name: 'Ana', [token]: 'interno' });

const id = defineReadOnly({}, 'id', 7);
assert.equal(id.id, 7);
assert.equal(Object.getOwnPropertyDescriptor(id, 'id').enumerable, true);
assert.throws(() => {
  id.id = 8;
}, TypeError);
assert.throws(() => Object.defineProperty(id, 'id', { value: 8 }), TypeError);
assert.throws(() => defineReadOnly([], 'id', 1), TypeError);

const temperature = createTemperature(20);
assert.equal(temperature.celsius, 20);
temperature.celsius = -3.5;
assert.equal(temperature.celsius, -3.5);
assert.throws(() => {
  temperature.celsius = NaN;
}, TypeError);
assert.throws(() => createTemperature(Infinity), TypeError);
assert.equal(Object.keys(temperature).includes('celsius'), true);

const profile = { name: 'Ana', preferences: { theme: 'paper' }, [token]: 1 };
const updated = updateProfile(profile, { name: 'Noa' });
assert.notStrictEqual(updated, profile);
assert.equal(profile.name, 'Ana');
assert.equal(updated.name, 'Noa');
assert.equal(updated.theme, 'paper');
assert.strictEqual(updated.preferences, profile.preferences);
assert.equal(updated[token], 1);
assert.equal(updateProfile({ name: 'Ana' }).theme, 'system');
assert.throws(() => updateProfile(null), TypeError);
assert.throws(() => updateProfile({}, []), TypeError);

const sealed = lockSettings({ level: 1, nested: {} }, 'seal');
sealed.level = 2;
assert.equal(sealed.level, 2);
assert.throws(() => {
  sealed.added = true;
}, TypeError);
sealed.nested.changed = true;
assert.equal(sealed.nested.changed, true);
const frozen = lockSettings({ level: 1, nested: {} }, 'freeze');
assert.throws(() => {
  frozen.level = 2;
}, TypeError);
frozen.nested.changed = true;
assert.equal(frozen.nested.changed, true);
assert.throws(() => lockSettings({}, 'deep'), RangeError);
