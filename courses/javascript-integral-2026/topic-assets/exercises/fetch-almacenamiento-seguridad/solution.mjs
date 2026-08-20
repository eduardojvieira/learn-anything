import assert from 'node:assert/strict';

/** Construye un Request HTTPS same-origin seguro para una API JSON propia. */
export function createApiRequest(path, { base, signal } = {}) {
  const origin = new URL(base);
  const url = new URL(path, origin);
  if (origin.protocol !== 'https:' || url.protocol !== 'https:' || url.origin !== origin.origin)
    throw new TypeError('La API debe usar HTTPS y el mismo origin');
  return new Request(url, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    redirect: 'error',
    cache: 'no-store',
    signal,
  });
}

/** Clasifica una Response sin confundir un HTTP 4xx/5xx con una falla de red. */
export function classifyResponse(response) {
  if (response === null || typeof response !== 'object') throw new TypeError('Response requerida');
  if (response.type === 'opaque') return { kind: 'opaque' };
  if (typeof response.ok !== 'boolean' || !Number.isInteger(response.status))
    throw new TypeError('Response inválida');
  return response.ok
    ? { kind: 'ok', status: response.status }
    : { kind: 'http_error', status: response.status };
}

/** Lee JSON sólo de respuestas exitosas y legibles; propaga red y abort. */
export async function fetchJson(request, fetchImpl = fetch) {
  if (!(request instanceof Request) || typeof fetchImpl !== 'function')
    throw new TypeError('Request y fetch válidos son requeridos');
  const response = await fetchImpl(request);
  const result = classifyResponse(response);
  if (result.kind === 'opaque') throw new TypeError('La respuesta opaca no se puede leer');
  if (result.kind === 'http_error') {
    const error = new Error(`HTTP ${result.status}`);
    error.name = 'HttpError';
    error.status = result.status;
    throw error;
  }
  return response.json();
}

const controller = new AbortController();
const request = createApiRequest('/api/profile', {
  base: 'https://app.example.test/dashboard',
  signal: controller.signal,
});
assert.equal(request.url, 'https://app.example.test/api/profile');
assert.equal(request.headers.get('accept'), 'application/json');
assert.equal(request.credentials, 'same-origin');
assert.equal(request.redirect, 'error');
assert.equal(request.cache, 'no-store');
assert.equal(request.signal.aborted, false);
assert.throws(
  () => createApiRequest('https://api.example.test/users', { base: 'https://app.example.test' }),
  TypeError,
);
assert.throws(() => createApiRequest('/api', { base: 'http://app.example.test' }), TypeError);
assert.deepEqual(classifyResponse(new Response(null, { status: 204 })), {
  kind: 'ok',
  status: 204,
});
assert.deepEqual(classifyResponse(new Response('', { status: 404 })), {
  kind: 'http_error',
  status: 404,
});
assert.deepEqual(classifyResponse({ type: 'opaque', status: 0, ok: false }), { kind: 'opaque' });
assert.throws(() => classifyResponse({ type: 'basic', status: '200', ok: true }), TypeError);
assert.deepEqual(await fetchJson(request, async () => Response.json({ name: 'Ana' })), {
  name: 'Ana',
});
await assert.rejects(
  () => fetchJson(request, async () => new Response('no', { status: 503 })),
  (error) => error.name === 'HttpError' && error.status === 503,
);
await assert.rejects(
  () => fetchJson(request, async () => ({ type: 'opaque', status: 0, ok: false })),
  TypeError,
);
const networkError = new TypeError('offline');
await assert.rejects(
  () => fetchJson(request, async () => Promise.reject(networkError)),
  (error) => error === networkError,
);
const abortError = new DOMException('cancelled', 'AbortError');
await assert.rejects(
  () => fetchJson(request, async () => Promise.reject(abortError)),
  (error) => error === abortError,
);
controller.abort();
assert.equal(request.signal.aborted, true);
