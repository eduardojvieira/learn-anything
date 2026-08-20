# 7.2 — Promises, async/await, streams y coordinación

## Esperar no es controlar

Una Promise representa el resultado futuro de una operación, no la operación misma. Esa diferencia evita bugs caros: una Promise rechazada no deshace una escritura, `Promise.race` no detiene al perdedor y un timeout sin una señal que el trabajo observe sólo cambia qué resultado le mostrás al llamador. En este capítulo vas a separar resolución, coordinación, cancelación y flujo de datos.

Requiere el modelo de funciones y del event loop. La meta es predecir qué Promise adopta a cuál, por dónde viaja un error, cuándo conviene cada combinador y cómo un stream frena al productor antes de llenar memoria. No alcanza con que una demo “llegue primero”: necesitás saber qué recursos quedan vivos y quién tiene el contrato de cerrarlos.

## Resolución, encadenamiento y thenables

Una Promise está pendiente y luego queda cumplida o rechazada para siempre. `resolve` no significa necesariamente “terminó con éxito”: ejecuta el procedimiento de resolución. Si recibe otra Promise, espera su estado; si recibe un **thenable** —un objeto con método `then`— intenta adoptarlo. Por eso no supongas que `Promise.resolve(valor)` termina de inmediato ni que todo thenable viene de código confiable.

```js
const externo = {
  then(resolve) {
    resolve(3);
  },
};
Promise.resolve(externo)
  .then((n) => n + 1)
  .then(console.log); // 4
```

Cada `then` devuelve una Promise nueva. Si el callback retorna un valor, cumple la siguiente con ese valor; si retorna una Promise o thenable, la siguiente lo adopta; si lanza, la siguiente rechaza. No necesitás crear `new Promise` para transformar una respuesta normal.

```js
const precioConIva = Promise.resolve(100)
  .then((precio) => precio * 1.21)
  .then(Math.round);
console.log(await precioConIva); // 121
```

El antipatrón es envolver una Promise sólo para reenviar sus estados. `new Promise((resolve, reject) => existente.then(resolve, reject))` agrega superficie para olvidar `return`, capturar mal una excepción o duplicar cancelación. Devolvé `existente.then(...)`, o escribí una función `async` cuando la lectura secuencial sea más clara.

Un thenable ajeno puede llamar callbacks de forma inesperada o lanzar al leer `then`; el algoritmo de Promise normaliza esos casos, pero no convierte una integración externa en segura. En fronteras de confianza validá el objeto antes de ejecutar capacidades; para resultados propios, devolvé Promises reales y documentá si pueden rechazar. Si necesitás interrumpir trabajo externo, documentá cómo recibe una señal y qué recurso libera.

## async/await y la ruta del error

Una `async function` siempre devuelve una Promise. `return 5` la cumple con 5; `throw new TypeError('dato')` la rechaza con ese error. `await` no bloquea el hilo: pausa sólo la función async hasta que el valor se resuelva y luego reanuda en una microtarea. Si lo esperado rechaza, `await` vuelve a lanzar en esa línea.

Esa reanudación también explica por qué una excepción dentro de una callback posterior no puede atraparse con un `try` que ya terminó: devolvé o esperá la Promise que representa esa continuación.

```js
async function parsear(id) {
  if (!Number.isInteger(id)) throw new TypeError('id entero requerido');
  return id * 2;
}
try {
  console.log(await parsear(2)); // 4
  await parsear('2');
} catch (error) {
  console.log(error.name); // TypeError
}
```

Poné `try/catch` alrededor de la unidad cuyo rechazo podés explicar o recuperar. Un catch gigante alrededor de toda una request confunde un error de programación con una respuesta remota. Cuando agregues contexto, conservá la causa: `throw new Error('No se pudo importar', { cause })`. El caller puede inspeccionar `error.cause`; no dependas del texto que emite un host.

`await` en un loop serializa a propósito. Para tareas independientes es más lento que iniciarlas todas y coordinar después; para escrituras dependientes, preserva el orden. La pregunta no es “¿async o then?”, sino qué dependencia y qué límite de recursos tiene cada tarea. Una función async no hace I/O paralelo por sí misma: expresa continuación y propagación de estados.

## all, allSettled, any y race

Los combinadores responden contratos distintos. Elegilos por el resultado que necesitás, no por costumbre.

| Combinador           | Cumple cuando                            | Rechaza cuando                      | Uso típico                    |
| -------------------- | ---------------------------------------- | ----------------------------------- | ----------------------------- |
| `Promise.all`        | todas cumplen; conserva orden de entrada | la primera rechaza                  | dependencias obligatorias     |
| `Promise.allSettled` | todas terminan                           | nunca por resultados individuales   | informe completo              |
| `Promise.any`        | una cumple                               | todas rechazan con `AggregateError` | primera réplica sana          |
| `Promise.race`       | la primera se cumple o rechaza           | idem                                | observar el primer settlement |

```js
const estados = await Promise.allSettled([
  Promise.resolve('cache'),
  Promise.reject(new Error('red')),
]);
console.log(estados.map((x) => x.status)); // ['fulfilled', 'rejected']
```

`all` falla rápido, pero las otras tareas ya iniciadas pueden seguir. `any` no equivale a “la más rápida”: ignora rechazos hasta conseguir un cumplimiento. `race` adopta el primer estado, incluso un rechazo. Ninguno de los cuatro aplica una política de cancelación por sí solo.

```js
const primera = await Promise.race([delay(5).then(() => 'rápida'), delay(50).then(() => 'lenta')]);
console.log(primera); // rápida
// La segunda demora sigue viva salvo que su contrato permita abortarla.
```

Esto importa con requests, timers, archivos y procesos. `race` puede ser una buena observación de latencia, pero no es una política de limpieza. Si ganaste con cache y abandonás una descarga, decidí si debés reutilizarla, consumirla o abortarla; cada alternativa tiene semántica y costo distintos.

## Cancelación, timeout y concurrencia limitada

Una Promise no tiene `cancel()`. La cancelación es cooperación: quien coordina crea un `AbortController`, pasa `signal` al trabajo y llama `abort(reason)` cuando decide terminar. El trabajo debe revisar `signal.aborted`, escuchar `abort` mientras espera y cerrar su recurso. `fetch`, `pipeline` de Node y varias APIs del host aceptan signal; una función propia debe declararlo explícitamente.

```js
const controller = new AbortController();
const trabajo = delay(100, { signal: controller.signal });
controller.abort(new Error('Usuario canceló'));
await trabajo; // rechaza con esa reason
```

Un timeout correcto es cancelación con una causa específica. `withTimeout` del laboratorio ejecuta `operation(signal)`, programa un timer que aborta el controller y limpia el timer en `finally`. No implementes el timeout como `race([operacion, reloj])` y lo llames cancelación: esa carrera puede rechazar mientras `operacion` sigue usando socket, CPU o una conexión.

La concurrencia también necesita contrato. `Promise.all(items.map(worker))` inicia todo de una vez; sirve para tres tareas pequeñas, no para diez mil descargas. Un límite de dos workers sólo permite dos operaciones activas, conserva el índice para ordenar resultados y pasa el mismo signal a cada worker. Cuando un worker falla, propagá el error; decidí aparte si abortás las tareas hermanas y asegurate de que éstas cooperen.

```js
let activas = 0;
const resultado = await mapLimit([1, 2, 3], 2, async (n) => {
  activas++;
  await delay(1);
  activas--;
  return n * 10;
});
console.log(resultado); // [10, 20, 30]
```

El límite no hace las operaciones paralelas mágicamente: en JavaScript un worker puede esperar I/O mientras otro avanza. Medí lo que realmente limita tu sistema —conexiones, rate limit, memoria o CPU— y elegí un número observable, no una constante “rápida”. Si la tarea puede modificar estado remoto, definí idempotencia y qué pasa con tareas iniciadas cuando otra falla.

## Streams: datos por partes y backpressure

Un stream mueve una secuencia sin requerir que toda viva en memoria. En Node, un `Readable` produce chunks, un `Transform` recibe y emite chunks modificados, y un `Writable` los consume. Conectalos con `pipeline` de `node:stream/promises`, que devuelve Promise, propaga errores, destruye la cadena ante fallas y acepta `{ signal }`.

```js
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
const upper = new Transform({
  transform(chunk, _encoding, callback) {
    callback(null, String(chunk).toUpperCase());
  },
});
const salida = [];
await pipeline(
  Readable.from(['sol', ' y luna']),
  upper,
  new Writable({
    write(chunk, _encoding, callback) {
      salida.push(String(chunk));
      callback();
    },
  }),
);
console.log(salida); // ['SOL', ' Y LUNA']
```

**Backpressure** es el freno del consumidor al productor. `writable.write(chunk)` devuelve `false` cuando su buffer llegó al umbral: quien escribe manualmente debe esperar el evento `drain` antes de seguir. Ignorarlo puede inflar memoria y latencia. `pipeline` ya coordina ese freno, por eso es preferible a encadenar `data`, `end` y `error` a mano para un flujo lineal.

No mezcles Web Streams y Node streams por el nombre: sus APIs se parecen pero no son idénticas. Este laboratorio requiere Node y usa `node:stream`; en un browser verificá disponibilidad y usá `ReadableStream`, `TransformStream` y `WritableStream` del host. Si una capacidad depende de runtime, detectala: `typeof ReadableStream === 'function'`. No prometas que existe en todo host ni que un `AbortSignal` cancele una API que no lo documenta.

## Laboratorio: lote cancelable y transformación acotada

Implementá `delay`, `withTimeout`, `mapLimit` y `uppercaseStream` en `starter.mjs`. `delay` acepta sólo milisegundos enteros no negativos y, con signal abortada, rechaza con `signal.reason`; debe remover su listener y timer cuando completa. `withTimeout(operation, timeoutMs)` crea el controller y entrega **ese** signal a operation. Cuando vence, la razón tiene nombre `TimeoutError`; siempre limpia el timer.

`mapLimit` acepta array, límite entero positivo y worker. Debe conservar el orden de `items`, no iniciar más de `limit` workers, pasar `(item, index, signal)` y rechazar si signal ya abortó o un worker falla. No inventes una cola genérica: una variable de próximo índice y hasta `limit` consumidores alcanza para este contrato.

`uppercaseStream` acepta sólo strings, arma `Readable -> Transform -> Writable` mediante `pipeline` y devuelve los chunks en mayúscula. El Writable usa `highWaterMark: 1` para hacer visible que el consumidor puede frenar. Está listo cuando los asserts cubren thenable, timeout, abort explícito, pico de concurrencia dos, orden, `allSettled`, `any`, `race` sin reclamo de cancelación y pipeline abortada.

Pista 1: una Promise recién creada necesita limpiar exactamente el timer y listener que creó. Pista 2: cada consumidor toma un índice antes de `await`; así no repite ítems. Pista 3: `pipeline` ya devuelve Promise y recibe `{ signal }`, no la envuelvas en otra Promise.

Recuperación: ¿qué adopta `Promise.resolve`? ¿cómo vuelve un throw de async? ¿qué combinador deja ver todos los estados? ¿qué falta para cancelar después de `race`? ¿qué significa `write() === false`? Transferí el lote a una paginación con máximo cuatro requests y diseñá un timeout que cancele una descarga real, no sólo la oculte.

En V2 empezá el diagnóstico socrático prediciendo qué tareas siguen vivas después de una carrera y qué stream espera a quién. El tutor puede corregir la confusión entre rechazo y cancelación; guardá la explicación revisada junto a la práctica. Sólo diagnóstico, práctica y evaluación observados producen evidencia de mastery. A las 48 horas, sin apuntes, explicá por qué `allSettled` no es un retry y escribí el contrato de abort de una función que abre un recurso.

Cuando corrijas un resultado, no digas sólo “pasó”. Nombrá la Promise que se adoptó, la razón de abort, el máximo de workers activos y el borde donde `drain` frena al productor. Registrá el input, el runtime y la señal: esos detalles permiten distinguir una coordinación correcta de una coincidencia de tiempos.

## Referencias primarias

- [ECMA-262 2026: Promise objects](https://tc39.es/ecma262/2026/multipage/control-abstraction-objects.html#sec-promise-objects)
- [ECMA-262 2026: async function objects](https://tc39.es/ecma262/2026/multipage/control-abstraction-objects.html#sec-async-function-objects)
- [Node.js: Stream API](https://nodejs.org/api/stream.html)
- [Node.js: stream/promises pipeline](https://nodejs.org/api/stream.html#streampromisespipelinestreams-options)
- [WHATWG Streams Standard](https://streams.spec.whatwg.org/)
- [WHATWG DOM: AbortController y AbortSignal](https://dom.spec.whatwg.org/#abortcontroller)
