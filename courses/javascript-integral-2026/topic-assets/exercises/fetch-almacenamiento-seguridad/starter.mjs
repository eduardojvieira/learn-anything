import assert from 'node:assert/strict';

/** Construye un Request HTTPS same-origin seguro para una API JSON propia. */
export function createApiRequest(path, { base, signal } = {}) {
  // TODO: validar path/base, exigir https y mismo origin; usar Accept JSON,
  // credentials: 'same-origin', redirect: 'error', cache: 'no-store' y signal.
}

/** Clasifica una Response sin confundir un HTTP 4xx/5xx con una falla de red. */
export function classifyResponse(response) {
  // TODO: distinguir opaque, HTTP error y éxito legible.
}

/** Lee JSON sólo de respuestas exitosas y legibles; propaga red y abort. */
export async function fetchJson(request, fetchImpl = fetch) {
  // TODO: fetch no rechaza por 4xx/5xx: clasificá response antes de json().
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const controller = new AbortController();
const request = createApiRequest('/api/profile', {
  base: 'https://app.example.test/dashboard',
  signal: controller.signal,
});
assert.equal(request.url, 'https://app.example.test/api/profile');
assert.equal(request.credentials, 'same-origin');
assert.equal(request.redirect, 'error');
assert.equal(request.cache, 'no-store');
assert.equal(request.signal.aborted, false);
assert.deepEqual(classifyResponse(new Response('', { status: 404 })), {
  kind: 'http_error',
  status: 404,
});
assert.deepEqual(classifyResponse({ type: 'opaque', status: 0, ok: false }), { kind: 'opaque' });
await assert.rejects(
  () => fetchJson(request, async () => new Response('no', { status: 503 })),
  (error) => error.name === 'HttpError' && error.status === 503,
);
const abortError = new DOMException('cancelled', 'AbortError');
await assert.rejects(
  () => fetchJson(request, async () => Promise.reject(abortError)),
  (error) => error === abortError,
);
controller.abort();
assert.equal(request.signal.aborted, true);
