# 10.2 — Red, servicios, persistencia y paralelismo en Node.js

## Un servicio no termina en `res.end`

Un endpoint que responde `200` puede haber aceptado un body infinito, esperado para siempre a otra dependencia, duplicado un cobro al reintentar o dejado una transacción a medio confirmar. Node coordina I/O muy bien; la parte difícil es decidir qué trabajo admitir, cuánto puede vivir y qué resultado conservar cuando la red no es confiable. Este capítulo une red, persistencia y concurrencia alrededor de ese contrato.

Requiere 10.1, 7.2 y 8.1. La meta no es memorizar módulos: es poder seguir un pedido desde DNS hasta una escritura durable, ponerle límites y explicar qué pasa cuando llega dos veces, tarda demasiado o el proceso se está apagando.

## TCP, DNS, HTTP, HTTPS y HTTP/2 son capas distintas

DNS traduce un nombre a una dirección; puede devolver varias, expirar según TTL o fallar antes de abrir conexión. TCP entrega un flujo ordenado de bytes entre sockets, no mensajes HTTP. HTTP/1.1 define cómo esos bytes forman request line, headers y body; HTTPS es HTTP sobre TLS; HTTP/2 conserva la semántica HTTP y multiplexa streams. HTTP/2 no exige TLS: Node expone `http2.createServer()` sin cifrado (h2c); para browsers y HTTPS se usa normalmente TLS con `createSecureServer()`. Ninguna variante elimina timeouts, límites ni saturación del origen.

```js
import { lookup } from 'node:dns/promises';

console.log(await lookup('localhost')); // por ejemplo { address: '127.0.0.1', family: 4 }
```

Ese resultado no garantiza que un servicio escuche allí. Separá en logs `dns`, `connect`, `tls`, `headers` y `body`: “falló HTTP” no alcanza para decidir si reintentar. Tampoco asumás que HTTP preserva una conexión por request. El agente puede reutilizar sockets keep-alive; un proxy puede terminar TLS y abrir otra conexión hacia tu proceso.

En HTTP definí método, URL, representación, códigos y headers antes de escribir handlers. `POST /payments` no se vuelve seguro sólo porque use JSON. Si el cliente corta luego de que el servidor confirmó la transacción, no sabe si repetir: ése es un problema de semántica, no de sintaxis.

## TLS, crypto y secretos: identidad antes que cifrado

TLS autentica al servidor con un certificado y cifra el transporte; no autoriza a quien llama ni valida el JSON. En producción verificá hostname y cadena de confianza. No desactives validación de certificados para “arreglar” un entorno: corregí la CA o la configuración. HTTPS protege el tramo que termina donde termina TLS; si hay proxy, documentá y protegé el siguiente tramo también.

`node:crypto` sirve para aleatoriedad, hashes, firmas y comparación de secretos. Para un webhook firmado, verificá el cuerpo crudo con HMAC y compará con `timingSafeEqual` sólo después de comprobar igual longitud. Un hash no cifra y una variable de entorno no vuelve secreto a un valor: evita subirlo, limitar quién lo lee, rotalo y no lo imprimas. Las claves y tokens entran por configuración de despliegue, no por código ni fixtures.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

const expected = createHmac('sha256', secret).update(rawBody).digest();
const received = Buffer.from(signature, 'hex');
const valid = received.length === expected.length && timingSafeEqual(received, expected);
```

La comparación temporal no arregla un secreto filtrado ni una firma aplicada al JSON reserializado. Conservá el body exacto, limitá su tamaño antes de acumularlo y registrá sólo un identificador de evento.

## Worker threads, child processes y pool

I/O de red y base de datos no necesita `worker_threads`: Node cede mientras espera. Un cálculo CPU-intensivo sí bloquea el event loop y retrasa a todos los requests. `Worker` ejecuta JavaScript en otro thread y comunica datos por structured clone o transferencia; poné `resourceLimits`, manejá `error` y `exit`, y no crees uno por request. Para tareas repetidas usá un pool fijo con cola **acotada**. `child_process` crea otro proceso: elegilo si necesitás ejecutar un binario, aislar un crash o usar otro runtime; también implica IPC, arranque y límites propios.

Un pool no hace una operación mágica ni acelera una query remota. Dimensionalo con mediciones, CPU disponible y memoria. Cada item debe tener deadline, cancelación cooperativa si corresponde y resultado correlacionable. Si la cola está llena, devolvé una sobrecarga explícita; guardar trabajo sin límite traslada la caída a memoria y latencia.

## Backpressure, límites y exhaustion

Un `Writable.write(chunk)` devuelve `false` cuando su buffer pasó el high-water mark. Pausá al productor y esperá `drain`; seguir escribiendo consume memoria hasta que el proceso cae o degrada al resto. Lo mismo aplica a streams de request, colas internas, pools de conexiones y listas de promises: cada frontera debe tener tamaño máximo, política de rechazo y métrica.

```js
async function writeLine(stream, line) {
  if (!stream.write(`${line}\n`)) await new Promise((resolve) => stream.once('drain', resolve));
}
```

No uses `Promise.all` sobre una lista no acotada de inputs externos. Procesá por concurrencia limitada y propagá `AbortSignal` a operaciones que lo soporten. También fijá máximos de body, headers, conexiones, filas por página y tiempo de CPU. Un 413, 429 o 503 temprano es más honesto que aceptar trabajo que no podés completar.

## Timeouts, keep-alive y cierre ordenado

Un timeout es un límite de responsabilidad: DNS, conexión, headers, request completo, dependencia y base pueden necesitar valores distintos. En `http.Server`, `requestTimeout` y `headersTimeout` protegen contra clientes lentos; `keepAliveTimeout` decide cuánto esperar otra request en un socket ya atendido. No copies números universales: elegilos desde SLO, proxy y carga, luego medilos.

Ante `SIGTERM`, primero marcá el proceso como no listo para recibir tráfico, dejá de aceptar conexiones y de tomar jobs nuevos, esperá los requests en vuelo hasta un deadline y recién entonces cerrá recursos. `server.close()` deja de aceptar y cierra conexiones idle; no termina por sí solo una operación colgada. Tener un deadline final evita que una instancia quede viva indefinidamente, pero documentá qué trabajo puede quedar para reintento.

## APIs HTTP y validación

Validá método, `Content-Type`, tamaño, forma, tipos, rangos y autorización antes de llamar al dominio. Respondé una representación estable: 201 con recurso creado, 202 si sólo aceptaste trabajo asíncrono, 400 para formato inválido, 401/403 para identidad/permisos, 404 para recurso ausente, 409 para conflicto, 422 cuando la representación es válida pero viola regla de negocio, 429 para rate limit y 5xx para falla propia o dependencia.

No expongas `Error.message` de driver, SQL ni stack. Generá un request id, devolvé un error público pequeño y vinculá el detalle seguro en logs. La validación de esquema reduce entradas imposibles; las reglas que requieren estado —saldo, unicidad, ownership— siguen perteneciendo a la transacción o a una restricción de datos.

## SQL, transacciones, índices y pools

Una transacción agrupa lecturas y escrituras: commit las hace visibles juntas; rollback descarta su trabajo. Su aislamiento define qué anomalías tolerás. Para reservar stock o debitar saldo, la regla crítica tiene que estar en SQL mediante constraint, lock o actualización condicional, no sólo en un `if` de Node que dos requests pueden pasar a la vez.

Un índice acelera un patrón de consulta al costo de espacio y escrituras. Diseñalo desde `WHERE`, `JOIN`, orden y cardinalidad; verificá con el plan real, no con intuición. Un pool de conexiones también es una cola finita: cada request debe liberar la conexión en `finally`, usar timeout y no abrir un cliente por query. Aumentar el pool por reflejo puede ahogar la base antes que mejorar throughput.

```sql
UPDATE accounts SET balance = balance - $1
WHERE id = $2 AND balance >= $1;
-- cero filas afectadas: no hubo débito válido
```

Ese resultado es el contrato concurrente. Después registrá el hecho durable en una outbox dentro de la misma transacción; publicar a una cola antes del commit crea eventos de cosas que quizá nunca existieron.

## NoSQL, cachés y consistencia

NoSQL no significa “sin esquema”: documentá claves, versiones, TTL, partición, escritura condicional y qué lectura puede estar atrasada. Una cache acelera una lectura repetida, pero introduce dos copias. Elegí invalidación, TTL, versionado o read-through según el costo de servir un dato viejo. Nunca uses cache como única fuente de verdad para autorización, saldo o deduplicación durable.

El patrón cache-aside lee primero cache, va al origen en miss y vuelve a poblar. Puede sufrir stampede: muchas requests fallan el mismo miss y golpean la base. Coalescé carga por clave con límite y vencimiento, o aceptá algunos misses; no agregues un lock global que transforme una clave lenta en caída total. Si el sistema es distribuido, decir “eventualmente consistente” exige nombrar qué puede verse viejo y cuánto daño produce.

## Colas, eventos, webhooks y WebSocket

Una cola desacopla productor y consumidor: necesitás ack, reintento, visibilidad, dead-letter y límite de intentos. La entrega suele ser al menos una vez, así que el consumidor debe ser idempotente. Un evento describe un hecho pasado (`payment.confirmed`); un comando pide una acción. Mezclarlos dificulta ownership y reintentos.

Un webhook es HTTP saliente hacia otra organización: firmalo, aplicá timeout, reintentá sólo fallas transitorias y entregá eventos duplicados de forma esperable. WebSocket mantiene una conexión bidireccional; requiere autenticación al conectar, límites de mensajes, heartbeats y reconexión. No es una cola durable: el cliente puede desconectarse entre dos mensajes, por lo que el estado importante sigue en persistencia o un log recuperable.

## Idempotencia, retries, circuit breakers y rate limits

Una idempotency key identifica una intención del cliente. Guardá clave, identidad del actor, huella normalizada del request y respuesta final en almacenamiento durable con una restricción única. Si llega la misma clave con igual request, devolvé la respuesta previa; si cambia el payload, es conflicto. Si dos requests llegan a la vez, la unicidad de datos decide una sola ejecución. Un `Map` local, como el laboratorio, muestra la semántica pero se pierde al reiniciar y no coordina réplicas.

Reintentá sólo operaciones idempotentes o protegidas por esa clave, y sólo errores transitorios. Usá un máximo, backoff con jitter y deadline total; repetir un 400 o rechazo de negocio amplifica ruido. Un circuit breaker abre tras fallas para dejar respirar a una dependencia, rechaza rápido durante una ventana y permite pocas pruebas controladas después. No reemplaza timeout, observabilidad ni una política de fallback.

Rate limit protege una frontera por identidad, ruta o costo. El algoritmo —token bucket, ventana deslizante— debe coincidir con la política y funcionar en el alcance correcto: memoria local sólo limita una instancia. Devolvé 429 con información de reintento cuando sea seguro y no conviertas un límite en permiso de acumular una cola infinita.

## Laboratorio: outbox de webhook con concurrencia finita

En `starter.mjs` vas a completar `createOutbox`. Recibe una función `deliver` y límites `maxPending` y `maxAttempts`. `send({ key, payload })` acepta sólo JSON sin pérdida, normaliza su representación y coalesce pedidos simultáneos con la misma key aunque cambie el orden de claves; si el payload difiere lanza `RangeError`. Sólo reintenta errores con `error.retryable === true`, hasta el máximo. `maxPending` limita trabajos **en vuelo**, no éxitos retenidos: la caché de respuestas de este laboratorio es intencionalmente no acotada. Un trabajo nuevo que excede concurrencia lanza `RangeError`; uno fallido se elimina para poder intentar de nuevo con la misma key. Producción necesita TTL o presupuesto de retención y persistencia según su contrato. `deliver` representa la frontera HTTP y los tests comprueban concurrencia, no una red simulada.

Pista 1: creá y registrá la entry antes de que corra `deliver`; diferirla a un microtask evita cachear un rechazo síncrono. Pista 2: `JSON.stringify` y `JSON.parse` detectan serialización; compará el original y el normalizado para rechazar pérdida. Pista 3: el contador de pending aumenta únicamente para keys nuevas en vuelo y debe bajar en `finally`.

Está listo cuando `node solution.mjs` cubre validación, JSON con pérdida, deduplicación en vuelo aun con claves reordenadas, respuesta repetida, conflicto de payload, throw síncrono, retry transitorio, falla terminal y capacidad.

Recuperación: ¿qué aporta HTTP/2 y qué aporta TLS? ¿cuándo esperás `drain` y qué cota protege memoria? ¿por qué una transacción necesita constraint o actualización condicional? ¿qué exige una entrega al menos una vez del consumidor? ¿cuándo es seguro reintentar con una idempotency key?

Para transferirlo, diseñá la tabla SQL con `(actor_id, idempotency_key)` único y una outbox escrita en la transacción; después definí qué firma, timeout y códigos reintenta tu webhook. En 48 horas, explicá qué pierde el `Map` al reiniciar y qué capa debe imponer el rate limit si hay cuatro réplicas.

En V2, empezá el diagnóstico socrático prediciendo qué ocurre si llega la misma key dos veces antes de la respuesta. Autoexplicá por qué el segundo llamado comparte trabajo y por qué un retry no prueba que el primer intento no tuvo efecto. El feedback puede corregir una confusión entre idempotencia y “exactly once”; registrá práctica o evaluación sólo cuando ocurra mediante el flujo V2. Esa evidencia observada, no este README, es la que permite derivar mastery.

## Referencias primarias

- [Node.js: HTTP](https://nodejs.org/api/http.html)
- [Node.js: HTTP/2](https://nodejs.org/api/http2.html)
- [Node.js: TLS](https://nodejs.org/api/tls.html) y [crypto](https://nodejs.org/api/crypto.html)
- [Node.js: worker threads](https://nodejs.org/api/worker_threads.html) y [child process](https://nodejs.org/api/child_process.html)
- [Node.js: streams y backpressure](https://nodejs.org/api/stream.html)
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110)
- [IETF: RateLimit header fields](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)
