# 7.3 — Paralelismo, modelo de memoria y ciclo de vida

## El estado que nadie posee termina poseyéndote

Un cálculo pesado traba la interfaz, entonces creás un worker. Después el worker responde tarde, dos incrementos pierden un resultado o una cache retiene más de lo esperado. Son fallos distintos, pero comparten una pregunta: ¿quién puede observar qué estado, cuándo y durante cuánto tiempo? Este capítulo requiere el modelo de Agents de 1.1 y el de identidad/alias de 1.2. La meta no es “usar workers”; es elegir un protocolo cuyo estado final puedas explicar cuando un mensaje llega tarde, un recurso falla o el GC no corre cuando querés.

## Agentes, workers y mensajes

ECMAScript define **Agents** con contextos de ejecución, stack y jobs. Un host puede exponer esa idea mediante Web Workers, `worker_threads` de Node u otra superficie. Un worker tiene ambiente global y módulo propios; no recibe mágicamente las variables léxicas del creador. Pero no afirmes el inverso de más: un worker **no equivale necesariamente a un thread de sistema operativo**. El host decide cómo planifica y mapea agentes a recursos físicos. Crear un worker tampoco hace paralelo un algoritmo que espera cada resultado en serie.

El camino por defecto es pasar datos. En browser, `postMessage`; en Node, los puertos de `worker_threads`. El host aplica clon estructurado a muchos valores. Una función, un closure y la mayoría de los objetos con comportamiento no cruzan ese límite como una referencia viva. Un `ArrayBuffer` puede transferirse: el receptor pasa a poseerlo y el emisor queda detached. Un `SharedArrayBuffer`, en cambio, representa memoria visible para varios agentes del mismo Agent Cluster.

Diseñá mensajes como una API chica. Un pedido necesita tipo, datos validados e identificador; una respuesta necesita el mismo id y resultado o error normalizado:

```js
const pending = new Map();
worker.onmessage = ({ data }) => pending.get(data.id)?.resolve(data.result);
worker.postMessage({ type: 'sum', id: 17, values: [2, 3] });
// el worker valida y responde { type: 'sum-result', id: 17, result: 5 }
```

El id evita asociar la respuesta 17 con el pedido 18 cuando terminan en otro orden. Definí además qué significa cancelación, timeout, reinicio y mensaje desconocido. Un timeout del padre no deshace trabajo remoto: sólo cambia qué resultado está dispuesto a esperar. Si el trabajo produce efectos, necesitás una clave de idempotencia o una operación que el worker pueda abandonar cooperativamente. Un mensaje no es garantía de orden global entre puertos ni una transacción. Para un pipeline simple: dueño único del estado, cola de pedidos, respuesta por id y límite de concurrencia. Sumá memoria compartida sólo cuando medir muestre que copiar o serializar es el cuello de botella.

La diferencia práctica es **ownership**. Con mensajes, el emisor conserva o transfiere la propiedad de un valor; el receptor trabaja sobre una copia o sobre un buffer que ahora le pertenece. Ese borde impide que una escritura accidental aparezca del otro lado. Con memoria compartida no hay traspaso de dueño: todos pueden observar bytes y el protocolo debe decir quién publica, quién consume y cuándo un buffer puede reutilizarse. Documentá esa decisión junto al mensaje. Por ejemplo, “el padre transfiere el buffer de entrada, el worker crea el resultado y lo transfiere de vuelta” tiene un ciclo de vida inequívoco; “ambos miran `view[0]`” no lo tiene hasta que agregás estados y Atomics.

## SharedArrayBuffer y Atomics

Con un buffer compartido dos agentes pueden mirar los mismos bytes. Para usar `Atomics`, elegí una typed array entera compartida, como `Int32Array`. Esta secuencia tiene una carrera:

```js
const seen = counter[0];
counter[0] = seen + 1;
```

Si ambos agentes leen `0`, ambos escriben `1`: hubo dos pedidos, quedó uno. `Atomics.add(counter, 0, 1)` realiza la actualización como operación atómica y devuelve el valor previo.

```js
const counter = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
console.log(Atomics.add(counter, 0, 1)); // 0
console.log(Atomics.load(counter, 0)); // 1
```

Este laboratorio elige un contrato mínimo y honesto: mensajes y función aceptan sólo enteros **Int32 firmados**, de `-2 ** 31` a `2 ** 31 - 1`, porque ese es el dominio del view. El contador es modular, no un contador matemático: al sumar uno a `2 ** 31 - 1` queda `-2 ** 31`. Esa conversión no es un error de Atomics; es la representación de `Int32Array`. Si el producto necesita contar sin wrap, definí otro contrato antes de programar: `BigInt64Array` si targets y dominio lo permiten, o `compareExchange` con política explícita de overflow, rechazo, saturación o rotación. No aceptes un entero seguro enorme para después truncarlo silenciosamente.

Atomics no convierte un diseño ambiguo en uno correcto. Nombrá posiciones: `0 = estado`, `1 = cantidad`, `2 = error`; definí transiciones y quién escribe cada una. Usá `Atomics.store`/`load` para flags, y `Atomics.compareExchange` cuando la transición dependa del valor anterior. Nunca reutilices una posición como contador, flag y error según “lo que toque”.

`Atomics.wait` puede bloquear hasta cambio o timeout; `Atomics.notify` despierta esperas. No lo invoques en el hilo principal de una interfaz. Aun en un worker, toda espera necesita timeout, condición de salida y propietario de recuperación. Un orden circular de locks o una espera que nadie notificará es un **deadlock**. Un contador con `Atomics.add` no necesita lock; agregar uno aumenta el riesgo sin comprar seguridad. Reducí estados compartidos; para dos recursos imponé orden total de adquisición. Para espera no acotada, preferí mensajes con timeout y cancelación explícita.

En browsers, `SharedArrayBuffer` depende de aislamiento del documento y política del host. En Node, presencia y restricciones son otras. Probá la capacidad exacta:

```js
const canShare = typeof SharedArrayBuffer === 'function' && typeof Atomics.add === 'function';
console.log(canShare); // true o false
```

Si falta, volvé a mensajes con copias o transferencias. Puede ser más lento, pero conserva un aislamiento más fácil de razonar.

Una operación atómica tiene un contrato acotado: evita que esa operación individual se intercale, no valida tu índice, no vuelve atómico un objeto vecino y no inventa una política de error. Si publicás datos en varias posiciones, escribí primero el payload y publicá al final un estado que el consumidor lea atómicamente; si el consumidor ve “listo”, ya sabe qué posiciones puede leer. A la inversa, no modifiques payload que otro agente todavía puede consumir. Este orden de publicación reduce estados imposibles sin exigir un lock global. Los tiempos también forman parte del contrato: un timeout de `wait` es un resultado que hay que manejar, no una prueba de que el otro agente murió.

## Alcanzabilidad, GC y allocation pressure

El GC libera un objeto cuando deja de ser alcanzable desde roots del runtime: globals, stacks activos, módulos, closures vivos y estructuras que ellos alcancen. “Salió de este bloque” no significa “ya fue recolectado”. Un listener, Promise pendiente, timer, `Map` global o closure puede conservar una referencia. Y que sea inalcanzable no da fecha: el GC decide según runtime y presión de memoria.

```js
const cache = new Map();
function remember(key, value) {
  cache.set(key, value);
}
```

Esto no es una pérdida automáticamente: es una política de retención. El problema aparece si las claves crecen sin límite, no hay TTL ni presupuesto y el proceso vive horas. Medí heap, tasa de asignación y tamaño de cache antes de culpar al GC. La **allocation pressure** puede provocar pausas y throughput pobre aunque el heap final se estabilice: millones de objetos temporales, arrays intermedios o strings concatenados pueden costar más que memoria retenida.

Reducí trabajo y asignaciones observables: procesá por lotes, reutilizá buffer sólo si ownership es claro y no retengas un buffer grande por un dato derivado chico. Medí con el profiler y cargas representativas; microbenchmarks esconden serialización, I/O y warm-up. No dependas de `global.gc()` para corrección: puede no existir y no prueba producción. Verificá que removiste la referencia fuerte y cerraste recursos; no intentes adivinar el milisegundo de liberación.

## WeakRef, FinalizationRegistry y caches

`WeakMap` es lo mínimo cuando asociás metadatos a objetos sin querer que la asociación los mantenga vivos. No es iterable: no permite que una enumeración estabilice la vida de las claves.

```js
const parsedBySource = new WeakMap();
function parseOnce(source) {
  let parsed = parsedBySource.get(source);
  if (!parsed) parsedBySource.set(source, (parsed = parse(source)));
  return parsed;
}
```

Si `source` pierde referencias fuertes, la cache no debe conservarlo. Puede recalcular; ese es el contrato. No sirve si necesitás enumerar, expirar por tiempo o garantizar supervivencia. `WeakRef.deref()` puede devolver objeto ahora y no hacerlo después: nunca hagas la corrección depender de ello. `FinalizationRegistry` recibe una notificación eventual luego de recolección; puede llegar tarde o no llegar antes de terminar el proceso. **No es cleanup crítico**: no cierres archivos, transacciones, sockets, locks ni borres datos importantes desde un finalizer. Como mucho, usalo para mantenimiento auxiliar tolerante a no ocurrir. Timers, puertos, suscripciones y archivos se limpian donde se adquieren, explícita e idempotentemente.

Tampoco uses `WeakRef` para esconder un límite de cache faltante. Una cache por clave string, URL o id numérico necesita una política explícita porque esas claves no son objetos que el runtime pueda debilitar del modo que esperás. Elegí capacidad máxima, TTL o invalidación por versión según el producto y medí misses. Para una cache por identidad de objeto, `WeakMap` expresa mejor la intención: el valor derivado no modifica la vida de la entrada. En ambos casos, que el GC recupere memoria nunca reemplaza cerrar una conexión ni remover un listener registrado.

## `using`, `await using` y limpieza determinista

La gestión explícita de recursos usa `Symbol.dispose` para cleanup síncrono y `Symbol.asyncDispose` para asíncrono. Con soporte del runtime, `using` y `await using` registran un recurso y lo disponen al salir del bloque, incluso ante error:

```js
// Sólo en un runtime compatible.
using lock = acquireLock();
await using connection = await openConnection();
```

Esto es limpieza determinista por alcance, distinta del finalizer del GC. Pero explicit resource management es **ES2027 y runtime-dependent**. Un runtime viejo puede rechazar el archivo antes de llegar a `typeof`. Entregá build o módulo separado para esa sintaxis y detectá símbolos, stacks y ruta de carga. `DisposableStack` y `AsyncDisposableStack` registran varias limpiezas en orden inverso; para uno o dos recursos, `try`/`finally` es la ruta compatible más clara:

```js
const connection = await openConnection();
try {
  await connection.query('SELECT 1');
} finally {
  await connection.close();
}
```

Hacé `close` idempotente: timeout, cancelación y error pueden converger. Para un worker, el ciclo incluye detener recepción, cancelar trabajo, cerrar puertos y liberar recursos externos. Terminarlo puede abortar tareas: definí efectos restantes y cómo el padre detecta respuesta perdida.

Feature detection no significa ejecutar un recurso real para “probar”. Consultá la superficie sin efectos, elegí el módulo compatible antes de cargar sintaxis nueva y conservá `try`/`finally` como fallback explícito. Si tu paquete declara soporte de `using`, anotá runtime y versión de CI: un símbolo presente sin parser, o parser presente sin `DisposableStack`, no equivale a la capacidad completa que usa tu código.

## Laboratorio y recuperación

Abrí `starter.mjs`. `validateCounterMessage` acepta sólo un objeto plano `{ type: 'increment', amount }` con `amount` Int32 firmado y devuelve copia normalizada. `incrementSharedCounter` valida una `Int32Array` sobre `SharedArrayBuffer`, usa `Atomics.add` en el índice 0 y devuelve valor previo; su overflow envuelve deliberadamente. `resourceManagementSupport` reporta símbolos, stacks y sintaxis sin asumir presencia. Pista 1: rechazá arrays, prototipos ajenos y valores fuera de Int32. Pista 2: no separes lectura y suma. Pista 3: la sintaxis se prueba en compilador aislado para que el laboratorio siga parseando.

Está terminado cuando starter deja de fallar y `node solution.mjs` pasa. Los asserts cubren mensaje inválido, contador no compartido, rechazo fuera de Int32, suma/decremento y el borde `MAX_INT32 + 1 → MIN_INT32`, además de capacidad boolean. No fuerzan GC ni ejecutan `using`: dependen del runtime.

Respondé sin mirar: ¿qué no promete un worker sobre OS threads? ¿qué campo asocia respuesta y pedido? ¿por qué lectura más escritura pierde incrementos? ¿qué retiene vivo un objeto? ¿por qué un finalizer no cierra un lock? Transferí el modelo a un worker que comprime imágenes: diseñá inicio, progreso, resultado, cancelación y error con ids y dueño de buffers. Como segunda transferencia, elegí entre contador modular Int32, `BigInt64Array` o CAS con saturación para cuotas de una API y justificá overflow. En V2, respondé primero el diagnóstico socrático y guardá la explicación; el feedback y la corrección revisada quedan asociados a esa práctica. Sólo práctica o evaluación efectivamente realizadas generan evidencia y mastery derivado; no inventes ninguna. En 48 horas resolvé un worker que espera una señal imposible y retiene buffer grande: proponé timeout, cierre y fallback sin `SharedArrayBuffer`.

## Referencias primarias

- [ECMA-262: Agents y Agent Clusters](https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html)
- [ECMA-262: Shared memory y Atomics](https://tc39.es/ecma262/multipage/memory-model.html)
- [ECMA-262: WeakRef y FinalizationRegistry](https://tc39.es/ecma262/multipage/managing-memory.html)
- [ECMA-262: Explicit Resource Management](https://tc39.es/ecma262/multipage/managing-memory.html#sec-explicit-resource-management)
- [Node.js: worker_threads](https://nodejs.org/api/worker_threads.html)
- [WHATWG HTML: Web Workers](https://html.spec.whatwg.org/multipage/workers.html)
