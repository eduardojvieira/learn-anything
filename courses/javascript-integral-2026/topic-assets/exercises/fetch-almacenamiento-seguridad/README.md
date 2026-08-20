# 9.2 — Fetch, URLs, almacenamiento y seguridad web

## Una petición no es una promesa de datos

Una UI que dice “no cargó” puede estar describiendo cinco problemas distintos: construyó mal una URL, el servidor devolvió HTTP, el navegador no permite leer la respuesta, no hay red o los datos persistidos ya no sirven. Separarlos evita dos bugs repetidos: tratar un `404` como caída de red y creer que CORS protege una API.

Requiere 9.1. La meta es seguir una solicitud desde `URL` hasta `Response`, elegir almacenamiento por su semántica y nombrar el límite real de cada control de seguridad. El laboratorio no llama Internet: vuelve observable el contrato que una UI impone antes y después de `fetch`.

## URL, Request, Headers y bodies

`URL` es un parser, no una concatenación de strings. Conservá una base conocida y construí paths relativos con `new URL(path, base)`: normaliza segmentos y separa origen —scheme, host y puerto— de path. Los parámetros son datos, por eso se escriben con `url.searchParams.set`, no interpolando `?q=${texto}`. Si una URL llega de configuración o usuario, validá protocolo y origin contra una allowlist antes de pedirla.

```js
const url = new URL('/api/search', 'https://app.example.test/cursos');
url.searchParams.set('q', 'fetch & seguridad');
console.log(url.href); // https://app.example.test/api/search?q=fetch+%26+seguridad
```

`Request` representa intención: URL, método, headers, body, credenciales, caché, redirecciones y signal. `Headers` normaliza nombres y no deja que JavaScript fije `Cookie`, `Host` u `Origin`; el navegador mantiene esas fronteras. Un body es un stream: `response.json()`, `text()` y `arrayBuffer()` lo consumen. Si necesitás mostrar una respuesta y guardarla en Cache API, clonala antes de la primera lectura.

El consumo es de una sola vez por cada copia. Este ejemplo es autocontenido: ambas copias producen el mismo objeto una vez y el segundo intento sobre la original rechaza. No guardes el body ya leído esperando volver a parsearlo; guardá la `Response` clonada o los datos ya parseados según el contrato.

```js
import assert from 'node:assert/strict';

const original = Response.json({ lesson: 'streams' });
const copy = original.clone();
assert.deepEqual(await original.json(), { lesson: 'streams' });
assert.deepEqual(await copy.json(), { lesson: 'streams' });
await assert.rejects(() => original.json(), TypeError);
console.log('cada copia se leyó una vez');
// cada copia se leyó una vez
```

```js
const request = new Request('/api/profile', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify({ theme: 'dark' }),
});
console.log(request.method, request.headers.get('accept')); // PATCH application/json
```

No uses JSON para un archivo si el endpoint espera `multipart/form-data`: usá `FormData` y dejá que fetch genere su boundary. Para binario elegí `arrayBuffer` o stream. Representación, tamaño y `Content-Type` son contrato del servidor, no una suposición del cliente.

## HTTP no es una falla de transporte

`fetch()` resuelve cuando obtiene una `Response`, incluso si es `404`, `429` o `503`. Esos estados son HTTP válido: revisá `response.ok` o `response.status`. Rechaza por URL/request inválido, políticas del navegador, red o aborto. Por eso `catch` no maneja por sí solo errores de aplicación.

```js
const response = await fetch('/api/profile');
if (!response.ok) throw new Error(`HTTP ${response.status}`);
const profile = await response.json();
console.log(profile.name);
```

Un `401` puede abrir login, un `409` pedir resolver conflicto y un `503` ofrecer reintento. No reintentes a ciegas un `POST` no idempotente: quizá el servidor creó el recurso aunque se cortó la conexión. Si el dominio necesita reintentos de escritura, diseñá una clave de idempotencia con el servidor.

`redirect` sigue redirecciones por defecto. Para una operación sensible podés usar `redirect: 'error'`. `cache` expresa preferencia al stack HTTP (`default`, `no-store`, `reload`), no reemplaza `Cache-Control`, `ETag` o `Vary` del servidor. Una respuesta personalizada no debe ir a una caché pública compartida.

Las cookies son credenciales HTTP. El default de `credentials` es **`'same-origin'`**: se mandan al mismo origin y no se amplían automáticamente a otro. `'include'` pide incluirlas cross-origin, pero para leer la respuesta el servidor necesita CORS con origin explícito y `Access-Control-Allow-Credentials: true`; `*` no sirve con credenciales. Elegí explícitamente en una API crítica y fijá `Secure`, `HttpOnly` y un `SameSite` apropiado.

## SOP, CORS, CSP y permisos

Same-origin policy (SOP) separa scheme, host y puerto: `https://app.example.test` y `https://api.example.test` no son el mismo origin. El navegador puede dejar salir un request pero bloquear que JavaScript lea la respuesta cross-origin salvo que el servidor use CORS. Para requests no simples aparece preflight `OPTIONS`; para otros, `Access-Control-Allow-Origin` habilita exposición.

**CORS no es autorización de servidor.** curl, una app nativa o una página comprometida pueden llamar un endpoint aunque un navegador no pueda leer el body. El servidor debe autenticar identidad y autorizar recurso y acción. Tampoco uses `mode: 'no-cors'` como arreglo: entrega respuesta **opaca**, con status `0`, headers vacíos y body ilegible. Sirve sólo si no necesitás observar el resultado, no para JSON.

```js
const response = await fetch('https://cdn.example.test/pixel', { mode: 'no-cors' });
console.log(response.type, response.status, response.body); // opaque 0 null
```

Content Security Policy (CSP) limita fuentes: `connect-src 'self' https://api.example.test` restringe destinos de fetch, WebSocket y EventSource. No sanea input ni autoriza usuarios. Una CSP estricta con nonces/hashes reduce el impacto de XSS, pero no reemplaza escapar datos en su contexto HTML, atributo o URL. Probala primero en modo report-only; un wildcard sólo oculta el problema.

Permissions Policy controla qué APIs potentes puede usar un documento o iframe —cámara, geolocalización, micrófono—; el permiso visible a la persona es otra capa. CSP controla fuentes; Permissions Policy controla capacidades. Confundirlas vuelve imposible explicar por qué una llamada falla.

## Almacenamiento: durabilidad y exposición

`localStorage` y `sessionStorage` son pares string/string síncronos y por origin. El primero sobrevive cierres; el segundo es por pestaña/sesión. Van bien para una preferencia pequeña, pero pueden lanzar por cuota, modo privado o política y bloquean el hilo si abusás. Cualquier JavaScript que ejecute en el origin puede leerlos: no son buen lugar para access tokens cuando existe riesgo XSS.

```js
localStorage.setItem('theme', JSON.stringify({ value: 'dark', version: 1 }));
const saved = JSON.parse(localStorage.getItem('theme') ?? '{"value":"system"}');
console.log(saved.value); // dark
```

Leé storage como entrada no confiable: validá versión, forma y rango; nunca `eval`. Una cookie `HttpOnly` no es legible por JS y reduce exposición a XSS, pero obliga a diseñar CSRF, `SameSite` y autorización de servidor. Ningún almacenamiento reemplaza ese diseño.

Para registros estructurados, índices y transacciones asíncronas usá IndexedDB. No inicies transacciones en `unload`: al cerrar, el navegador puede abortarlas antes de completar. Guardá durante la interacción y recuperá en el siguiente arranque. Cache API guarda pares `Request`/`Response`, normalmente desde un service worker: es para assets y respuestas reutilizables offline, no una base de datos.

```js
const response = await fetch('/catalog.json');
if (response.ok) {
  const cache = await caches.open('catalog-v1');
  await cache.put('/catalog.json', response.clone());
}
```

Definí versión, respuestas cacheables, invalidación y fallback. No guardes respuestas autenticadas, privadas ni mutaciones pendientes sin diseño de identidad y vencimiento. `navigator.onLine` es una pista, no prueba de que tu servidor responda. Offline es estado de producto: mostrale fecha de los datos, permití reintento y reconciliá al volver.

## Abort, red y recuperación

`AbortController` cancela cuando navegás, cambiás filtro o vence un timeout de UI. Pasá su `signal` a fetch y usá un controller por operación: abortar uno compartido aborta todas. El rechazo suele ser `AbortError`, pero tu UI puede reconocer con seguridad que su signal quedó abortada y no mostrar “falló” cuando la persona reemplazó una búsqueda. No lo envuelvas ni lo reemplaces: preservar la identidad permite a quien llama distinguir su cancelación de una falla de red.

```js
const controller = new AbortController();
const pending = fetch('/api/search?q=js', { signal: controller.signal });
controller.abort();
try {
  await pending;
} catch (error) {
  if (controller.signal.aborted) console.log('búsqueda reemplazada');
  else throw error;
}
```

Separá abortado, red/offline, HTTP y parseo/contrato. Un timeout no es opción estándar de fetch: se implementa abortando una signal y limpiando el timer. Para reintentos usá límite, backoff y jitter, respetá `Retry-After`, y sólo aplicalos a operaciones idempotentes o con contrato de idempotencia.

## Decisiones pequeñas que evitan incidentes

Un cliente no debería inventar URLs a partir de datos de negocio. Centralizá la base de una API propia y pasá paths o parámetros tipados por el contrato de la aplicación. Aun así, conservar `new URL` en el borde es útil: una ruta que empieza con `//otro.example` o una URL absoluta no debe saltar de origin sólo porque parecía un path. El laboratorio exige mismo origin por esa razón. En una aplicación que realmente necesita varios origins, reemplazá esa regla por una allowlist explícita, con motivo y tests por cada destino; no por `includes('example')` ni por un regex amplio.

Los headers también separan datos de política. `Accept: application/json` expresa qué sabés consumir; no prueba que el servidor vaya a cumplir. Revisá `Content-Type` cuando el endpoint pueda devolver HTML de login, un proxy o un archivo. Si parsear JSON falla, no tapes el error con un objeto vacío: la UI necesita saber que recibió un contrato distinto. Del mismo modo, `Authorization` no vuelve secreto a un valor que escribiste en un log de navegador, URL, analytics o storage. Redactá tokens en observabilidad y nunca los pongas en query string: URLs quedan en historial, logs y Referer con demasiada facilidad.

Cache API y el caché HTTP resuelven problemas relacionados pero no idénticos. El caché HTTP puede revalidar una respuesta mediante `ETag` y respetar cabeceras del servidor sin que tu JavaScript toque el body. Cache API es una colección que tu código nombra y llena; por eso también es tu responsabilidad borrar versiones viejas y no devolver una respuesta de otra persona. Una estrategia cache-first puede ser correcta para un logo versionado, pero peligrosa para saldo o permisos. Network-first con fallback puede ser mejor para datos frescos, aunque necesita una pantalla honesta si vuelve la copia anterior. Elegí por costo de dato viejo, no porque una receta sea popular.

IndexedDB aporta atomicidad dentro de sus transacciones, no sincronización mágica entre pestañas, dispositivos o servidor. Guardá una versión de esquema, una clave de entidad y estado de sincronización; al reconectar, el servidor sigue siendo quien decide conflictos. Para una cola local de mutaciones, persistí suficiente contexto para reconstruir el intento, pero no repitas sin límite ni ocultes al usuario que hay trabajo pendiente. Si el navegador borra almacenamiento por presión de cuota, la aplicación debe poder recuperarse desde fuente remota o explicar la pérdida; persistente no significa inmortal.

La seguridad se compone por capas que fallan de maneras distintas. Validar URL reduce destinos accidentales; HTTPS protege transporte frente a observadores de red, no el código que corre en la página; CSP limita parte de lo que puede hacer una inyección; HttpOnly reduce lectura de cookies por scripts; SameSite reduce ciertos envíos cross-site; y autorización del servidor decide finalmente si la acción es válida. Ninguna capa convierte datos de una persona en confiables. Validá en el servidor, usá protección CSRF cuando las cookies permitan una acción y modelá respuestas de error sin filtrar detalles de otras cuentas.

Antes de cerrar un cambio de frontend, hacé una tabla mental: ¿qué pasa si la URL es ajena, si la respuesta es 401, si llega 500, si el body no es JSON, si se aborta, si no hay red, si hay una copia vencida y si storage falla? No necesitás crear ocho abstracciones para responderla. Necesitás que cada estado tenga una rama deliberada, una prueba observable y un mensaje que no mienta. Esa es la diferencia entre una llamada fetch que funciona en la demo y un límite de cliente que sigue siendo entendible bajo presión.

## Laboratorio y aprendizaje real

En `starter.mjs`, `createApiRequest` debe aceptar HTTPS same-origin y producir un `Request` JSON con `credentials: 'same-origin'`, `redirect: 'error'`, `cache: 'no-store'` y signal. `classifyResponse` separa éxito, HTTP y opaca. `fetchJson` propaga red/abort, rechaza opacas y convierte 4xx/5xx en `HttpError` con status.

`node starter.mjs` empieza RED; implementá hasta GREEN y recién después contrastá `solution.mjs`. Pista 1: compará `origin`, no strings. Pista 2: `Response.ok` cubre 200–299. Pista 3: primero await fetch; después clasificá: el 503 no llegó al catch. Está listo cuando pasan URL relativa, cross-origin, HTTP, opaca, JSON, red y señal.

Recuperación: ¿qué resuelve fetch frente a 404? ¿cuál es el default de credentials? ¿qué diferencia SOP de CORS? ¿por qué no-cors no lee JSON? ¿qué storage elegís para preferencias, registros y assets? Transferí el contrato a autocomplete cancelable y borradores offline con fecha de última sincronización.

En V2, explicá antes de ejecutar qué capa bloquea cada caso: URL, HTTP, SOP/CORS, CSP, permiso, storage o red. El feedback puede corregir “CORS autoriza”; esa corrección queda en una sesión real. Sólo diagnóstico, práctica y evaluación observados generan evidencia y mastery derivado. En 48 horas, diseñá perfil que distinga 401/503/offline y justifique dónde vive cada dato sensible.

## Referencias primarias

- [WHATWG Fetch Standard](https://fetch.spec.whatwg.org/)
- [WHATWG URL Standard](https://url.spec.whatwg.org/)
- [WHATWG HTML: Web Storage](https://html.spec.whatwg.org/multipage/webstorage.html)
- [W3C Indexed Database API](https://w3c.github.io/IndexedDB/)
- [W3C Service Workers: Cache objects](https://w3c.github.io/ServiceWorker/#cache-objects)
- [W3C Content Security Policy Level 3](https://w3c.github.io/webappsec-csp/)
- [W3C Permissions Policy](https://w3c.github.io/webappsec-permissions-policy/)
