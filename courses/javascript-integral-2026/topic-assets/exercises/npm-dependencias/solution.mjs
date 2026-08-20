import assert from 'node:assert/strict';

/** @param {unknown} version */
function parseVersion(version) {
  if (typeof version !== 'string') throw new TypeError('la versión debe ser texto');
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) throw new TypeError('se espera major.minor.patch sin prerelease');
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger))
    throw new RangeError('cada componente debe ser un Number entero seguro');
  return parts;
}

/** @param {number[]} left @param {number[]} right */
function compare(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] < right[index] ? -1 : 1;
  }
  return 0;
}

/** @param {unknown} range */
export function caretUpperBound(range) {
  if (typeof range !== 'string' || !range.startsWith('^'))
    throw new TypeError('se espera un rango caret');
  const [major, minor, patch] = parseVersion(range.slice(1));
  if (
    (major > 0 && major === Number.MAX_SAFE_INTEGER) ||
    (major === 0 && minor > 0 && minor === Number.MAX_SAFE_INTEGER) ||
    (major === 0 && minor === 0 && patch === Number.MAX_SAFE_INTEGER)
  )
    throw new RangeError('el componente incrementado excedería el entero seguro');
  return major > 0 ? [major + 1, 0, 0] : minor > 0 ? [0, minor + 1, 0] : [0, 0, patch + 1];
}

/** @param {unknown} range @param {unknown} lockedVersion */
export function lockSatisfies(range, lockedVersion) {
  const locked = parseVersion(lockedVersion);
  if (typeof range !== 'string') throw new TypeError('el rango debe ser texto');
  if (!range.startsWith('^')) return compare(parseVersion(range), locked) === 0;
  const lower = parseVersion(range.slice(1));
  return compare(locked, lower) >= 0 && compare(locked, caretUpperBound(range)) < 0;
}

/** @param {unknown} config */
export function releasePlan(config) {
  if (config === null || typeof config !== 'object' || Array.isArray(config))
    throw new TypeError('config debe ser un objeto');
  const { hasLockfile, lockMatchesManifest, has2fa, trustedPublishing } = config;
  if (
    ![hasLockfile, lockMatchesManifest, has2fa, trustedPublishing].every(
      (value) => typeof value === 'boolean',
    )
  )
    throw new TypeError('cada política debe ser boolean');
  if (!hasLockfile || !lockMatchesManifest) throw new Error('CI requiere un lockfile compatible');
  if (!has2fa || !trustedPublishing) throw new Error('release requiere 2FA y trusted publishing');
  return { install: 'npm ci', release: 'allowed' };
}

assert.deepEqual(caretUpperBound('^2.4.1'), [3, 0, 0]);
assert.deepEqual(caretUpperBound('^0.4.1'), [0, 5, 0]);
assert.deepEqual(caretUpperBound('^0.0.4'), [0, 0, 5]);
assert.equal(lockSatisfies('2.4.1', '2.4.1'), true);
assert.equal(lockSatisfies('2.4.1', '2.4.2'), false);
assert.equal(lockSatisfies('^2.4.1', '2.8.0'), true);
assert.equal(lockSatisfies('^2.4.1', '3.0.0'), false);
assert.equal(lockSatisfies('^0.4.1', '0.5.0'), false);
for (const invalid of ['^2.4', '^02.4.1', '^2.4.1-beta', 2])
  assert.throws(() => caretUpperBound(invalid), TypeError);
for (const unsafe of ['^9007199254740992.0.0', '^0.9007199254740992.0', '^0.0.9007199254740992'])
  assert.throws(() => caretUpperBound(unsafe), RangeError);
assert.throws(() => caretUpperBound('^9007199254740991.0.0'), RangeError);
assert.throws(() => lockSatisfies('2.0.0', '9007199254740992.0.0'), RangeError);
assert.throws(() => lockSatisfies('9007199254740992.0.0', '9007199254740993.0.0'), RangeError);
assert.deepEqual(
  releasePlan({
    hasLockfile: true,
    lockMatchesManifest: true,
    has2fa: true,
    trustedPublishing: true,
  }),
  { install: 'npm ci', release: 'allowed' },
);
for (const config of [
  { hasLockfile: false, lockMatchesManifest: true, has2fa: true, trustedPublishing: true },
  { hasLockfile: true, lockMatchesManifest: false, has2fa: true, trustedPublishing: true },
  { hasLockfile: true, lockMatchesManifest: true, has2fa: false, trustedPublishing: true },
  { hasLockfile: true, lockMatchesManifest: true, has2fa: true, trustedPublishing: false },
])
  assert.throws(() => releasePlan(config), Error);
assert.throws(() => releasePlan({}), TypeError);
