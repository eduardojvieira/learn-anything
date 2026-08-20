import assert from 'node:assert/strict';

/**
 * Devuelve el límite superior exclusivo de un rango caret `^major.minor.patch`.
 * Modela la regla relevante de semver, sin intentar interpretar todos los rangos npm.
 * @param {unknown} range
 */
export function caretUpperBound(range) {
  // TODO: validar componentes Number seguros y devolver [major, minor, patch] exclusivo.
}

/** @param {unknown} range @param {unknown} lockedVersion */
export function lockSatisfies(range, lockedVersion) {
  // TODO: rechazar componentes inseguros antes de comparar la versión fijada con el rango.
}

/** @param {{hasLockfile: boolean, lockMatchesManifest: boolean, has2fa: boolean, trustedPublishing: boolean}} config */
export function releasePlan(config) {
  // TODO: rechazar configuraciones inválidas y exigir controles antes del release.
}

// RED inicialmente: implementá hasta que este archivo pase. solution.mjs es referencia posterior.
assert.deepEqual(caretUpperBound('^2.4.1'), [3, 0, 0]);
assert.deepEqual(caretUpperBound('^0.4.1'), [0, 5, 0]);
assert.equal(lockSatisfies('^2.4.1', '2.8.0'), true);
assert.equal(lockSatisfies('^2.4.1', '3.0.0'), false);
assert.throws(() => caretUpperBound('^9007199254740991.0.0'), RangeError);
assert.throws(() => lockSatisfies('2.0.0', '9007199254740992.0.0'), RangeError);
assert.deepEqual(
  releasePlan({
    hasLockfile: true,
    lockMatchesManifest: true,
    has2fa: true,
    trustedPublishing: true,
  }),
  { install: 'npm ci', release: 'allowed' },
);
