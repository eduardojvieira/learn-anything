# 7.1 — Jobs, event loops, tareas y microtasks

## Una sola hebra no significa una sola cosa a la vez

Un botón parece responder mientras una red descarga, un timer vence y una Promise continúa. La intuición útil no es que JavaScript “hace todo en paralelo”: en un agente, el código JavaScript ordinario corre una unidad a la vez. Cuando esa unidad termina, el host puede elegir más trabajo. Esa frontera explica por qué un loop largo congela una interfaz, por qué una reacción de Promise suele aparecer antes que un timer ya vencido y por qué una cadena de microtasks puede arruinar la latencia.

Este capítulo requiere 2.1 y 1.3. Vas a separar el modelo del lenguaje de las decisiones de browser o Node, predecir trazas que sí tienen contrato y reconocer las que no. “Task”, “microtask” y “event loop” no son sinónimos: pertenecen a capas distintas.

## Run-to-completion: la unidad que no se intercala

Una tarea que ejecuta JavaScript corre **hasta completar** antes de que el mismo event loop elija otra tarea. Si una función llama a otra, ambas usan la pila de llamadas de esa tarea; un click posterior, un timer o una respuesta de red no se intercalan entre dos líneas de tu loop sólo porque lleven esperando tiempo.

```js
const trace = [];
setTimeout(() => trace.push('timer'), 0);
for (let i = 0; i < 3; i++) trace.push(`sync-${i}`);
trace.push('fin');
console.log(trace); // [ 'sync-0', 'sync-1', 'sync-2', 'fin' ]
```

El callback del timer no puede entrar antes de `fin`: el script actual todavía no devolvió el control. Eso no dice cuándo correrá el timer; dice cuándo **no** puede correr. En un browser, un loop de 300 ms impide que el agente procese input y, en condiciones normales, que actualice la pantalla durante ese intervalo. En Node bloquea el hilo que atiende ese event loop: una conexión o timer listos esperan.

Run-to-completion no es una promesa de atomicidad frente a todos los agentes. Workers, procesos y otros realms pueden ejecutar trabajo propio y comunicarse con mensajes o memoria compartida. Este capítulo habla de una iteración de un event loop y de su JavaScript; paralelismo y memoria compartida vienen en 7.3.

La consecuencia de diseño es concreta: si procesar un lote puede exceder tu presupuesto de respuesta, dividilo en trozos y devolvé el control entre ellos. No midas ese presupuesto suponiendo “un frame de 16 ms”: la frecuencia de refresh, carga y política de rendering cambian. Medí interacción real y elegí un límite que permita cancelar, pintar o atender I/O.

## ECMAScript: Jobs y reacciones de Promise

ECMAScript especifica el lenguaje y su mecanismo abstracto de **Job queues**. Un Job es trabajo que el motor ejecuta más tarde, bajo control de su host. Las reacciones de Promise —el callback de `.then`, `.catch` o `.finally` de una Promise ya resuelta— se encolan como `PromiseReactionJob`. `await` usa el mismo mecanismo para continuar la función asíncrona; no abre un hilo.

```js
const trace = [];
Promise.resolve().then(() => trace.push('promise'));
trace.push('sync');
console.log(trace); // [ 'sync' ]
queueMicrotask(() => console.log(trace)); // [ 'sync', 'promise' ]
```

La primera impresión ocurre dentro del script actual. Después, cuando el host hace un checkpoint de microtasks, corre la reacción pendiente. `queueMicrotask` es una API expuesta por hosts modernos para pedir trabajo en esa misma clase de checkpoint; no es una palabra clave de ECMAScript. En browsers y Node se integra con la cola de microtasks del motor, pero no conviertas esa coincidencia práctica en una definición del lenguaje.

Un detalle decisivo: se drena la cola hasta quedar vacía. Si una microtask agrega otra, la nueva también entra antes de que el host continúe con la siguiente tarea.

```js
const trace = [];
queueMicrotask(() => {
  trace.push('a');
  queueMicrotask(() => trace.push('c'));
});
queueMicrotask(() => trace.push('b'));
setTimeout(() => console.log(trace), 0); // [ 'a', 'b', 'c' ]
```

El timer sólo observa el resultado después del checkpoint. `a` y `b` respetan FIFO; `c` se agrega al final de la misma cola. Usá microtasks para completar una transición corta con orden consistente —por ejemplo, publicar un resultado cacheado de modo similar a uno asíncrono—, no para hacer cómputo pesado.

No prometas más de lo especificado. La reacción de una Promise ya instalada no corre sincrónicamente; el orden de reacciones en la misma cola responde al orden de encolado. Pero ECMAScript no define que un timer, un mensaje de red o una pintura compitan con ella según una única cola universal.

## El host: event loop, tareas y fuentes

Un **event loop** es una estructura del host. HTML define event loops, task queues y task sources para browsers; Node documenta su propio loop, fases y APIs. Una **task** del host puede venir de un timer, input, un mensaje, I/O u otra fuente. El loop selecciona una tarea elegible, la ejecuta hasta completar y hace checkpoints de microtasks en los puntos que su modelo define.

```js
button.addEventListener('click', () => {
  console.log('click');
  Promise.resolve().then(() => console.log('microtask'));
});
// Un click produce: click, luego microtask antes de la próxima task seleccionada.
```

Esa traza local es útil: el listener es la tarea actual y su reacción se drena al finalizarla. En cambio, esto no tiene un orden portable:

```js
setTimeout(() => console.log('timer'), 0);
someSocket.onmessage = () => console.log('network');
// No afirmes cuál imprime primero: son fuentes y disponibilidad del host.
```

La demora cero de `setTimeout` no significa “ahora”. Es un mínimo/umbral tras el cual el callback puede ser elegible; trabajo previo, políticas de nesting, carga y otras fuentes pueden retrasarlo. En Node, `setImmediate` y `setTimeout(..., 0)` tampoco forman una regla universal: el contexto, particularmente I/O, importa. `process.nextTick` es además una API específica de Node con prioridad propia; no la uses para explicar microtasks portables ni para decidir un orden entre ESM y CommonJS.

Una regla de ingeniería más segura es expresar la dependencia que realmente necesitás. Si B requiere el resultado de A, encadená A y B con una Promise, `await` o un callback del mismo protocolo. No “sincronices” con dos timers y una suposición sobre cuál fuente gana.

## Timers, I/O y rendering no son un reloj de precisión

Timers solicitan trabajo futuro; I/O entrega completions cuando el host las observa; rendering es una oportunidad que el browser puede tomar entre tareas. Ninguno convierte el thread de JavaScript en paralelo. Un callback de timer que calcula mucho tiempo puede atrasar input y rendering tanto como un script inicial.

```js
const started = performance.now();
setTimeout(() => {
  console.log(performance.now() - started); // al menos el umbral aproximado, no exacto
}, 20);
```

No escribas un assert que exija 20 ms: el scheduler del sistema y el event loop no garantizan una marca exacta. Para medir duración usá un reloj monotónico cuando el host lo ofrezca, y verificá rangos amplios o propiedades de orden, no un número mágico.

El rendering merece la misma cautela. Un browser puede renderizar entre tareas si tiene oportunidad, pero no debe hacerlo después de cada callback ni a 60 Hz. Una pantalla puede tener otra frecuencia, estar en background o perder frames por trabajo largo. `requestAnimationFrame`, cuando exista, coordina un callback con el ciclo de actualización del browser; Node no lo ofrece como contrato equivalente. Detectá capacidades antes de usarlas:

```js
const scheduleFrame = globalThis.requestAnimationFrame;
if (typeof scheduleFrame === 'function') scheduleFrame(() => console.log('frame disponible'));
else setTimeout(() => console.log('sin requestAnimationFrame'), 0);
```

El fallback mantiene la aplicación funcional, pero no le atribuye a `setTimeout` semántica de frame. Documentá qué necesitás: “ceder para que el host procese otras tareas” es distinto de “actualizar antes de la próxima pintura”.

## Starvation, latencia y cómo ceder

Una microtask recursiva parece pequeña, pero puede impedir que la cola quede vacía:

```js
function otra() {
  queueMicrotask(otra);
}
otra(); // starvation: timers, I/O y rendering pueden no recibir turno
```

No la ejecutes en una página o servicio real. Cada checkpoint encuentra una microtask nueva y no llega al punto de seleccionar la tarea siguiente. En Node, abusar de `process.nextTick` tiene un riesgo análogo y además es menos portable. El problema no es “Promise es lenta”: es elegir una cola de prioridad alta para trabajo que nunca termina.

Para trabajo particionable, conservá estado y programá el próximo chunk como una tarea del host. El mecanismo exacto depende del entorno; el contrato es no exceder un presupuesto y dejar trabajo pendiente explícito.

```js
function processBatch(items, index = 0) {
  const limit = Math.min(index + 100, items.length);
  for (; index < limit; index++) consume(items[index]);
  if (index < items.length) setTimeout(() => processBatch(items, index), 0);
}
```

El tamaño `100` no es universal: es un punto inicial medible. Para UI quizá prefieras una API de scheduling del browser con feature detection; para Node, `setImmediate` puede ser apropiado según el objetivo. No escondas esa elección detrás de un helper “universal” que prometa la misma prioridad en todos los hosts.

La latencia también aparece por trabajo sincrónico antes de `await`. Esta función no libera el thread hasta terminar el parseo:

```js
async function loadAndParse(text) {
  const data = JSON.parse(text); // bloquea ahora
  await Promise.resolve();
  return data;
}
```

`async` cambia cómo se entrega el resultado, no vuelve no bloqueante a cada línea. Si el parseo es grande, medí, dividí si la semántica lo permite o movelo a un worker con un protocolo explícito.

## Laboratorio: modelar el borde, no imitar un host

`starter.mjs` contiene una simulación mínima y determinista. `runTurn` recibe una tarea, una cola FIFO de microtasks y una traza: ejecuta primero la tarea y luego drena microtasks, incluso las agregadas mientras drena. No representa timers, rendering ni las fases de Node; justamente evita inventar un orden que el contrato no da. `shouldYield` decide si un lote agotó su presupuesto y todavía tiene trabajo pendiente.

Corré `node starter.mjs`: empieza RED. Implementá hasta GREEN y recién después contrastá `solution.mjs`. El contrato observable es: una tarea aparece antes de sus microtasks; `promise` aparece antes de la microtask anidada; la cola queda vacía; entradas inválidas lanzan; y sólo cedés cuando `processed >= budget` **y** hay pendientes.

Pista 1: `shift()` toma el primer elemento y el `while` debe consultar la longitud de nuevo. Pista 2: validá la forma de las entradas antes de ejecutar la tarea. Pista 3: `budget === 0` puede requerir ceder si hay pendiente; no lo confundas con “no hay trabajo”. Está terminado cuando todos los asserts de `solution.mjs` pasan y podés explicar por qué esa solución no predice `setTimeout` frente a I/O.

Recuperación: ¿qué no puede intercalarse dentro de una tarea? ¿qué agenda `.then`? ¿qué pertenece al host? ¿por qué `setTimeout(..., 0)` no es inmediato? ¿cómo una microtask recursiva produce starvation? Transferí el modelo a un autocompletado: separá parseo corto, request, render y cancelación. Después diseñá un importador grande que informe progreso sin bloquear input.

En V2 empezá por el diagnóstico socrático: dibujá qué entra como task, qué como microtask y dónde vuelve el control al host. En la autoexplicación, nombrá la capa de cada afirmación; el feedback puede corregir “Promise es paralela” o “timer cero es inmediato”. Esa corrección, la práctica real y una evaluación observada producen evidencia; mastery se deriva de ella, no de haber leído este capítulo. A las 48 horas, predecí una traza con script, Promise, microtask anidada y timer, y justificá qué partes son del lenguaje, cuáles del host y cuáles no debés prometer.

## Referencias primarias

- [ECMA-262 2026: Jobs and Job Queues](https://tc39.es/ecma262/2026/multipage/executable-code-and-execution-contexts.html#sec-jobs-and-job-queues)
- [ECMA-262 2026: PromiseReactionJob](https://tc39.es/ecma262/2026/multipage/control-abstraction-objects.html#sec-newpromisereactionjob)
- [WHATWG HTML: event loops](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
- [WHATWG HTML: timers](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers)
- [Node.js: process.nextTick()](https://nodejs.org/api/process.html#processnexttickcallback-args)
- [Node.js: timers](https://nodejs.org/api/timers.html)
