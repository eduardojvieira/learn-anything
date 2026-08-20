# 5.2 — Iterables, iteradores, generadores y secuencias

## Una secuencia no tiene por qué existir toda junta

Un reporte grande, páginas de una API o eventos de un socket suelen llegar de a poco. Si primero los volcás a un array, mezclás dos decisiones: cómo producir el próximo dato y cuánto almacenar. Los iterables separan esas responsabilidades. Te permiten describir una fuente como “dame el siguiente valor cuando lo necesites”, y recién después decidir si la consumís completa, si cortás temprano o si la conectás a otra etapa.

Requiere 2.3 y 4.2. La meta es distinguir iterable de iterator, usar generadores sin ocultar efectos, consumir fuentes asíncronas en orden y tratar las APIs nuevas según la capacidad real del runtime.

## Dos protocolos, dos preguntas

Un **iterable** responde “¿cómo obtengo un cursor nuevo?”: tiene una propiedad `[Symbol.iterator]` callable. Al invocarla entrega un **iterator**, que responde “¿cuál es el próximo valor?” con `next()`. Cada llamada devuelve un objeto `{ value, done }`; cuando `done` es `true`, el consumidor termina. `for...of`, spread, destructuring, `Set`, `Map` y `Array.from` empiezan pidiendo ese iterator.

```js
const puntos = ['norte', 'sur'];
const iterator = puntos[Symbol.iterator]();
console.log(iterator.next()); // { value: 'norte', done: false }
console.log(iterator.next()); // { value: 'sur', done: false }
console.log(iterator.next()); // { value: undefined, done: true }
```

Un array es iterable y su iterator es consumible. No son sinónimos: `{ next() {} }` puede ser iterator sin ser iterable; un objeto iterable puede crear un cursor nuevo cada vez. Por eso esto funciona dos veces:

```js
const letras = ['a', 'b'];
console.log([...letras]); // ['a', 'b']
console.log([...letras]); // ['a', 'b']
```

Pero no prometas lo mismo para un cursor ya obtenido. Una vez que `next()` avanzó, ese estado cambió. Los generators normalmente son iterator e iterable porque su `[Symbol.iterator]()` devuelve al propio generator. Es práctico para `for...of`, pero no los vuelve reiniciables: guardá una fábrica de iteradores si necesitás recorrer desde el comienzo otra vez.

Un iterable propio mínimo puede entregar un cursor independiente:

```js
const dosPasos = {
  *[Symbol.iterator]() {
    yield 'preparar';
    yield 'publicar';
  },
};
console.log([...dosPasos]); // ['preparar', 'publicar']
console.log([...dosPasos]); // ['preparar', 'publicar']
```

No implementes el protocolo sólo para que una API “acepte cualquier cosa”. Si una función necesita ordenar, mirar el largo o repetir el recorrido, pedí un array o materializá explícitamente con `Array.from`. Un iterator puede ser infinito, costoso o tener efectos al avanzar.

## Generadores: una pausa con estado

Una función declarada con `function*` no ejecuta su cuerpo al llamarla: devuelve un generator. `yield` produce un valor y pausa variables locales, posición y `try/finally` hasta el próximo `next()`. Eso hace que la función sea una buena herramienta para secuencias incrementales; no la uses para esconder I/O o mutaciones inesperadas.

```js
function* tickets(desde) {
  let actual = desde;
  while (true) yield actual++;
}
const ids = tickets(41);
console.log(ids.next().value); // 41
console.log(ids.next().value); // 42
```

La fuente es infinita; `Array.from(ids)` no es una “conversión cómoda”, es un cuelgue o agotamiento de memoria. Poné un límite junto al consumidor. El laboratorio implementa `takePages` para mostrar la idea: corta antes de pedir valores posteriores y nunca necesita acumular toda la fuente.

`yield*` delega en un iterable. Es el equivalente semántico de producir cada valor del delegado, con reglas adicionales para `throw`, `return` y el valor final del delegado. Para componer páginas normales, hace el código más directo:

```js
function* historial(paginas) {
  for (const pagina of paginas) yield* pagina;
}
console.log([...historial([['A', 'B'], ['C']])]); // ['A', 'B', 'C']
```

No confundas `yield* pagina` con `yield pagina`: el primero entrega cada elemento de `pagina`; el segundo entrega el array completo como un solo valor. Tampoco delegues ciegamente una fuente no iterable: el error está en el contrato de la página, no en el loop que la llamó.

## El protocolo asíncrono y el orden real

Un **async iterable** entrega `[Symbol.asyncIterator]()` y un async iterator cuyo `next()` produce una Promise de `{ value, done }`. Un `async function*` puede pausar con `await` y producir con `yield`; `for await...of` espera cada paso antes de pedir el siguiente. Esa espera conserva orden y backpressure básico: no arrancás la página siguiente sólo por haber creado el loop.

```js
async function* lecturas() {
  yield 'conectar';
  await Promise.resolve();
  yield 'recibir';
}
for await (const etapa of lecturas()) console.log(etapa);
// conectar
// recibir
```

`for await...of` también adapta un iterable síncrono. Es útil para una función como `collectAsync` que acepta ambas formas, aunque sobre una fuente sólo síncrona agrega el costo de la maquinaria Promise. Elegí `for...of` si sabés que no hay asincronía. El bucle no paraleliza: si necesitás concurrencia limitada para requests, diseñá ese límite y el manejo de fallas; no lo obtengas por accidente usando un generador async.

El cierre importa. Si el consumidor sale con `break` o lanza, `for...of` y `for await...of` intentan llamar `return()` en el iterator cuando existe. Un `finally` dentro de un generator es el lugar para liberar un recurso propio, pero no uses ese hecho para prometer que una conexión externa se cerró si el productor no implementa bien su cancelación.

## Iterator Helpers ES2025: transformaciones que tiran de la fuente

Los Iterator Helpers estandarizados en ES2025 agregan operaciones como `map`, `filter`, `take`, `drop`, `flatMap`, `reduce`, `some`, `every`, `find` y `toArray` a los iterators. La diferencia importante no es el nombre parecido a Array: `Iterator.from(values).filter(...).map(...)` crea una tubería **lazy**. Los callbacks corren cuando un consumidor pide valores.

```js
function* numeros() {
  for (let n = 1; ; n++) yield n;
}
if (typeof Iterator === 'function' && typeof Iterator.from === 'function') {
  const pares = Iterator.from(numeros())
    .filter((n) => n % 2 === 0)
    .map((n) => n * 10)
    .take(3);
  console.log(pares.toArray()); // [20, 40, 60]
}
```

Sin `take`, `toArray()` intentaría consumir una fuente infinita. `map` y `filter` no hacen que un iterator sea reutilizable ni convierten una operación con efectos en pura: si el callback registra o consulta una base, ese efecto ocurre al consumir, quizá más tarde de lo que sugiere el código. Poné efectos en bordes explícitos y mantené las transformaciones como cálculos cuando puedas.

No todos los runtimes que ejecutan módulos modernos tienen los helpers. Detectá la API exacta, no el user-agent:

```js
const hasIteratorHelpers = typeof Iterator === 'function' && typeof Iterator.from === 'function';
const dobles = hasIteratorHelpers
  ? Iterator.from([1, 2, 3, 4])
      .filter((n) => n % 2 === 0)
      .map((n) => n * 2)
      .toArray()
  : [1, 2, 3, 4].filter((n) => n % 2 === 0).map((n) => n * 2);
console.log(dobles); // [4, 8]
```

El fallback del laboratorio conserva la salida y recorre incrementalmente hasta encontrar dos pares; no materializa una fuente finita ni toca valores posteriores. Si necesitás una tubería lazy completa —por ejemplo la fuente es remota o infinita— no reemplaces helpers por `Array.from`; implementá cada etapa incrementalmente o rechazá esa ruta del runtime.

## ES2026: sequencing y materialización asíncrona

No mezcles los helpers ES2025 con las capacidades que el curso agrupa bajo ES2026. `Iterator.concat` secuencia iterables: entrega la primera fuente, después la siguiente, sin copiar todos los valores a un array. Sirve para unir una cabecera finita y una fuente posterior, pero sigue siendo un iterator consumible. `Array.fromAsync` materializa un async iterable —o iterable— esperando cada valor; es el límite deliberado donde decidís pagar memoria.

```js
const hasConcat = typeof Iterator === 'function' && typeof Iterator.concat === 'function';
const joined = hasConcat ? Iterator.concat(['inicio'], new Set(['medio', 'fin'])) : null;
console.log(joined ? [...joined] : 'sin Iterator.concat');

const hasFromAsync = typeof Array.fromAsync === 'function';
if (hasFromAsync) {
  console.log(await Array.fromAsync(lecturas())); // ['conectar', 'recibir']
}
```

Una especificación 2026 no actualiza una LTS, un browser embebido ni Node corporativo. Hacé feature detection de `Iterator.concat` y `Array.fromAsync` por separado; una puede existir sin la otra. Cuando no existe `Array.fromAsync`, un `for await...of` que junta valores es un fallback pequeño y equivalente para fuentes finitas. Cuando no existe `Iterator.concat`, un generator que haga `yield*` para cada fuente conserva el streaming. No importes un polyfill sólo para evitar esas pocas líneas sin antes medir compatibilidad y costo de bundle.

Además, `Array.fromAsync` es intencionalmente eager: no la uses sobre eventos sin fin ni sobre una paginación sin política de corte. Antes de materializar, preguntá cuántos elementos puede producir, qué pasa ante una falla a mitad de recorrido y si el orden es parte de la respuesta. “Async” no vuelve segura una colección ilimitada.

Tampoco confundas secuenciar con intercalar. `Iterator.concat(a, b)` agota `a` antes de pedir el primer valor de `b`; no alterna ni corre fuentes en paralelo. Si una operación necesita mezclar timestamps, priorizar eventos o frenar una fuente cuando otra falla, esa política merece una función con ese nombre y pruebas propias. La concatenación sólo expresa el caso más simple: una fuente termina y recién entonces empieza la siguiente.

## Laboratorio: páginas que no se comen de más

En `starter.mjs`, `isIterable` reconoce el protocolo síncrono sin consumirlo. `takePages(pages, limit)` acepta un iterable de páginas iterables, valida un límite entero seguro no negativo y usa `yield*` con un helper que recorta cada página al cupo restante. Entrega como máximo `limit` valores; un límite cero retorna antes de pedir la primera página exterior y una página inválida falla con TypeError. Esa política es observable: evita que un consumidor de preview recorra páginas futuras.

`collectAsync(source)` acepta iterable o async iterable, conserva el orden y usa `for await...of`; rechaza el resto. `firstDoubledPairs(values)` filtra pares, los duplica y toma dos. Si hay `Iterator.from`, usa helpers lazy ES2025; si no, un loop incremental retorna al segundo par. Corré `node starter.mjs`: empieza RED. Implementá hasta GREEN y recién entonces compará `solution.mjs`.

Pista 1: iterable no significa `Array.isArray`; mirá `Symbol.iterator`. Pista 2: hacé que el helper delegado devuelva cuántos valores entregó a `yield*`. Pista 3: `for await...of` maneja las dos clases de fuente, pero no reemplaza validar que una de las dos propiedades sea callable. Está listo cuando pasan los asserts de string, Map, fuente inválida, límite cero sin pull exterior, página inválida, source async, orden, fallback acotado y resultado de pares.

Recuperación: ¿qué devuelve `Symbol.iterator()`? ¿por qué un iterator se suele usar una vez? ¿qué diferencia hay entre `yield` y `yield*`? ¿qué espera `for await...of`? ¿qué acción vuelve eager una tubería lazy? Transferí este modelo a un exportador CSV que corte en 10.000 filas y a una paginación de API donde una cancelación de UI no siga pidiendo páginas.

En V2, empezá el diagnóstico socrático prediciendo cuántos valores consume cada fragmento. El feedback puede marcar que confundiste iterator con iterable o que materializaste una fuente infinita; la corrección revisada queda junto a tu respuesta. Sólo práctica, evaluación y corrección observadas producen evidencia de mastery derivado: no declares dominio por haber leído el capítulo. En 48 horas, escribí de memoria un iterable que se reinicie, un generator que delegue dos páginas y una ruta con feature detection para una API nueva.

Tu autoexplicación debe nombrar quién pide el próximo valor y dónde está el límite. “Usé un generator porque es más prolijo” no alcanza: indicá qué estado retiene, qué ocurre con `break` y por qué esa fuente no se convirtió en array. Esa evidencia permite corregir la decisión, no sólo el resultado.

## Referencias primarias

- [ECMA-262 2026: iteration](https://tc39.es/ecma262/2026/multipage/control-abstraction-objects.html#sec-iteration)
- [ECMA-262 2026: iterator objects](https://tc39.es/ecma262/2026/multipage/control-abstraction-objects.html#sec-iterator-objects)
- [ECMA-262 2026: generator function objects](https://tc39.es/ecma262/2026/multipage/control-abstraction-objects.html#sec-generatorfunction-objects)
- [ECMA-262 2026: async generator function objects](https://tc39.es/ecma262/2026/multipage/control-abstraction-objects.html#sec-asyncgeneratorfunction-objects)
- [ECMA-262 2025: Iterator Helpers](https://tc39.es/ecma262/2025/multipage/control-abstraction-objects.html#sec-iterator-helpers)
- [TC39: Iterator Sequencing](https://github.com/tc39/proposal-iterator-sequencing)
