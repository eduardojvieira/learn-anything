# 4.1 — Arrays, Map, Set y colecciones débiles

## Elegir por lo que debe seguir siendo cierto

Una lista de lecciones tiene orden y puede repetir valores. Un índice de lecciones por ID necesita asociar una clave a un valor. Una selección de tags no admite repetidos. Y metadata privada de un nodo quizá no debe mantener vivo al nodo sólo por estar en una cache. Las cuatro frases parecen parecidas —“guardar cosas”—, pero describen invariantes distintos. Elegir la colección por el invariante evita arreglar después con búsquedas lineales, banderas o limpieza imposible.

En este capítulo vas a separar arrays densos y dispersos, mutación y copia; `Map` de objeto; `Set` de array; y colecciones débiles de una cache normal. También vas a tratar como capacidades opcionales al álgebra de `Set` de ES2025 y a `Map.prototype.getOrInsert` / `getOrInsertComputed` de ES2026. Requiere 1.2 y 1.3: identidad, `undefined`, SameValueZero y mutación ya importan acá.

## Arrays: secuencia, índices y huecos

Un array es un objeto especializado para una secuencia indexada. Su `length` no cuenta necesariamente propiedades existentes: es uno más que el índice entero no negativo más grande, dentro de los índices array válidos. Un array **denso** tiene un elemento en cada posición que recorres; uno **disperso** tiene huecos, o sea índices que no son propiedades.

```js
const agenda = ['intro', 'arrays', 'map'];
const sparse = ['intro', , 'map'];
console.log(agenda.length, sparse.length); // 3 3
console.log(sparse[1], 1 in sparse); // undefined false
console.log([undefined][0], 0 in [undefined]); // undefined true
```

Leer un hueco y leer un elemento `undefined` producen el mismo valor, pero no el mismo estado. `in`, `Object.hasOwn` o una iteración que preserve índices permiten observar la diferencia. `forEach`, `map`, `filter`, `some`, `every` y `reduce` suelen no llamar el callback para huecos; `for...of` lee posiciones y recibe `undefined`. No diseñes un protocolo donde “hueco” signifique dato faltante: modelá la ausencia con `null`, `undefined` o un registro explícito según tu contrato. Los arrays dispersos también sorprenden al serializar y al transformar.

Asignar más allá de `length` crea esa dispersión y puede reservar una longitud absurda sin crear millones de valores útiles:

```js
const results = [];
results[3] = 'listo';
console.log(results.length, Object.keys(results)); // 4 [ '3' ]
console.log(results.map((x) => x ?? 'faltante')); // [ <3 empty items>, 'listo' ]
```

Para una lista que crece usá `push`; para una posición conocida validá que el índice tenga sentido. Un array no impone tipo, unicidad ni una clave estable. Que `[curso, curso]` sea válido no es un defecto: significa que la colección está expresando orden y multiplicidad, no reglas de dominio.

## Métodos mutables: el receptor también es un output

`push`, `pop`, `shift`, `unshift`, `splice`, `sort`, `reverse`, `fill` y `copyWithin` mutan el array receptor. `map`, `filter`, `slice`, `concat`, `flat`, `toSorted`, `toReversed`, `toSpliced` y `with` devuelven otra raíz. La palabra importante es raíz: ninguna de esas copias profundas clona los objetos que contiene.

```js
const queue = [{ id: 2 }, { id: 1 }];
const ordered = queue.toSorted((a, b) => a.id - b.id);
console.log(queue.map((x) => x.id)); // [ 2, 1 ]
console.log(ordered.map((x) => x.id)); // [ 1, 2 ]
console.log(queue[0] === ordered[1]); // true
```

Si necesitás soportar runtimes sin los métodos que copian, `[...queue].sort(compare)` es un fallback claro. En cambio, `queue.sort(compare)` es correcto cuando la API promete reordenar la misma cola. No escondas eso: quien conserva un alias observa el cambio.

```js
const tasks = ['leer', 'practicar'];
const alias = tasks;
tasks.splice(1, 0, 'explicar');
console.log(alias); // [ 'leer', 'explicar', 'practicar' ]
const next = tasks.toSpliced(0, 1, 'diagnosticar');
console.log(tasks, next); // original intacto; next cambia sólo la raíz
```

`sort` además convierte a string si no recibe comparador; `[10, 2].sort()` puede quedar `[10, 2]`, no orden numérico. Pasá `(a, b) => a - b` para números. No mutar por reflejo también cuesta: hacer una copia grande en cada paso de un pipeline puede subir memoria y tiempo. Elegí el contrato observable, documentalo y testeá que el input cambie o no cambie según corresponda.

En complejidad, leer/escribir un índice y `push`/`pop` al final son normalmente O(1) amortizado; insertar o borrar al inicio o en el medio desplaza elementos y es O(n). Buscar con `includes`, `indexOf`, `find` o un loop es O(n). Son órdenes de crecimiento, no una promesa de microsegundos: no reemplaces una lista corta y ordenada por una estructura más compleja sin una operación repetida que lo justifique.

## Map: una clave puede ser cualquier valor

Un objeto común sirve bien para un registro con claves string o Symbol conocidas. `Map` expresa otra cosa: asociaciones clave → valor, claves de cualquier tipo y orden de inserción. Sus claves se comparan con SameValueZero: `NaN` encuentra `NaN`, y `-0` y `0` son la misma clave. Objetos se comparan por identidad.

```js
const scores = new Map();
const ana = { id: 'ana' };
scores.set(ana, 8);
scores.set(NaN, 'borde');
console.log(scores.get(ana), scores.get(NaN)); // 8 borde
console.log(scores.has({ id: 'ana' })); // false
```

No conviertas un objeto a JSON como clave para simular identidad: cambia el contrato, puede colisionar y no representa ciclos ni todos los tipos. Si el ID del dominio es texto, `Map` con ese ID es razonable; si necesitás identidad del objeto exacto, usá el objeto como clave. Para listar pares, `for (const [key, value] of map)` es directo. `size` es O(1) como parte de la API; no cuentes claves manualmente.

El borde clásico es `undefined`: `map.get(key)` devuelve `undefined` tanto si no hay clave como si guardaste ese valor. `has` distingue presencia. Esta diferencia evita recrear una entrada que existe legítimamente:

```js
const cache = new Map([['prefetch', undefined]]);
console.log(cache.get('prefetch'), cache.has('prefetch')); // undefined true
if (!cache.has('prefetch')) cache.set('prefetch', []);
```

`Map.prototype.getOrInsert(key, value)` y `getOrInsertComputed(key, callback)` son métodos de ES2026. El primero inserta el valor dado sólo si falta la clave; el segundo calcula, inserta y devuelve sólo si falta. No confundas “valor falsy” con “clave ausente”: ambos consultan presencia. Como un runtime puede no tenerlos todavía, detectá la capacidad en el objeto antes de llamarla.

```js
function bucketFor(map, key) {
  if (typeof map.getOrInsertComputed === 'function') return map.getOrInsertComputed(key, () => []);
  if (!map.has(key)) map.set(key, []);
  return map.get(key);
}
```

Este fallback es deliberado: `map.get(key) ?? []` pierde la distinción de `undefined`; `map.get(key) || []` también confunde `0`, `false` o `''`. Si tu mapa permite valores no-array, validá antes de hacer `push`, como hace el laboratorio. Es O(1) promedio por lookup/inserción; la especificación no promete una implementación hash concreta ni una cota temporal absoluta.

## Set y álgebra: pertenencia, no orden de trabajo

`Set` guarda valores únicos, también bajo SameValueZero, y conserva orden de inserción para iteración. Es ideal para permisos activos, IDs ya vistos y tags, cuando “¿está?” es la pregunta principal. Convertir un array en Set elimina duplicados preservando la primera aparición:

```js
const tags = ['js', 'web', 'js', 'testing'];
const unique = new Set(tags);
console.log([...unique]); // [ 'js', 'web', 'testing' ]
console.log(unique.has('web'), unique.size); // true 3
```

`add`, `delete` y `clear` mutan; `has` consulta. `add` devuelve el mismo Set, no un Set nuevo. No uses Set si necesitás contar repeticiones: `new Set(['x', 'x']).size` es 1; para frecuencias usá `Map` de valor a contador. Tampoco una inserción en Set ordena tareas: su orden observable es el de inserción, no prioridad ni fecha.

ES2025 agrega `union`, `intersection`, `difference`, `symmetricDifference`, `isSubsetOf`, `isSupersetOf` e `isDisjointFrom`. Las cuatro primeras devuelven un Set nuevo; las tres últimas devuelven boolean. Reciben un objeto “set-like” con `size`, `has` y `keys`, no sólo `Set`, lo cual permite interoperar con `Map` cuando sus claves representan el universo de comparación. La intención se vuelve visible:

```js
const required = new Set(['read', 'write']);
const granted = new Set(['read', 'comment']);
console.log([...required.intersection(granted)]); // [ 'read' ]
console.log(required.isSubsetOf(granted)); // false
console.log([...granted.difference(required)]); // [ 'comment' ]
```

Estos métodos son ES2025, no una promesa universal de todos los engines que todavía ejecuten tu app. Detectá `typeof set.union === 'function'`. Para una unión simple, `new Set([...a, ...b])` es fallback. Para la semántica completa no pegues un polyfill enorme sin necesidad: elegí un baseline de runtime, una dependencia ya aprobada o un helper local testeado si la aplicación realmente necesita cada operación. La complejidad de `has` suele ser O(1) promedio; construir el resultado visita entradas, O(n + m) para una unión de dos Sets.

## WeakMap y WeakSet: ownership, no limpieza programada

`WeakMap` asocia claves objeto o `Symbol` no registrado a valores; `WeakSet` registra los mismos valores sin valor asociado. Las funciones entran por ser objetos. Desde ES2026, `Symbol('token')` puede ser clave débil; `Symbol.for('token')` no, porque el registro global retiene esa identidad. No son iterables ni exponen `size`. Esa ausencia es el contrato: si pudieras enumerar claves, la colección te daría una forma de observar una recolección de basura que los runtimes no prometen de manera determinista.

```js
const metadata = new WeakMap();
const visited = new WeakSet();
const node = { name: 'mapa' };
const token = Symbol('token');
metadata.set(node, { rendered: true });
metadata.set(token, { rendered: true });
visited.add(node);
visited.add(token);
console.log(metadata.get(node).rendered, visited.has(token)); // true true
// metadata.size; // undefined
// [...visited]; // TypeError: no es iterable
```

Usalas para metadata auxiliar ligada a la vida de un objeto ya propiedad de otra parte: nodos DOM, AST, instancias o marcas de ciclo. No las uses para un inventario, una cache que debés vaciar por fecha, telemetría o cualquier tarea que requiera recorrer entradas. Que una clave deje de ser alcanzable desde tu programa permite al GC liberar la asociación, pero no hay momento observable ni método para forzarlo. Un WeakMap es un ephemeron: que su valor apunte sólo de vuelta a su propia clave no mantiene viva esa clave por sí solo; una ruta externa alcanzable hacia clave o valor sí puede hacerlo. Dibujá las referencias antes de declarar una “solución de memoria”.

## Laboratorio: buckets, unión y metadata efímera

En `starter.mjs`, `addToBucket(map, key, value)` valida un `Map`, agrupa valores en un array y no confunde ausencia con un `undefined` ya guardado: si la entrada existe y no es array, incluido `undefined`, falla con TypeError. Usá `getOrInsertComputed` sólo tras feature detection; el fallback debe usar `has` antes de `get`.

`unionTags(left, right)` valida dos Sets, no muta ninguno y retorna un Set nuevo. Preferí `left.union(right)` sólo si existe; si no, `new Set([...left, ...right])` alcanza para unión. `markSeen(seen, value)` incrementa un contador de un WeakMap y acepta objeto, función o `Symbol()` no registrado; rechaza `null`, otros primitivos y `Symbol.for(...)`. No agrega campos al objeto, de modo que tampoco modifica lo que otros aliases pueden enumerar.

Pista 1: presencia y valor son preguntas distintas: mirá `has` antes de usar `get`. Pista 2: `typeof left.union === 'function'` es una detección de capacidad, no un chequeo de versión. Pista 3: una clave WeakMap válida es objeto no nulo, función o Symbol no registrado. Está listo cuando los asserts prueban una entrada `undefined` existente, misma identidad de bucket, unión sin mutación, fallback posible, incremento WeakMap, Symbol local y rechazo de `Symbol.for`/primitivos.

Recuperación: ¿qué diferencia un hueco de `undefined`? ¿cuáles métodos de array mutan? ¿cuándo `Map.get` es ambiguo? ¿qué igualdad usa Set? ¿por qué no podés enumerar WeakMap? Transferí el modelo a una lista de tareas con duplicados, un índice de usuarios por ID y metadata de nodos de un editor. Para cada caso nombrá el invariante, la operación repetida y la complejidad que importa.

En V2, respondé el diagnóstico socrático antes de correr el laboratorio: “¿esta operación necesita orden, unicidad, una clave o lifetime débil?”. Autoexplicá por qué un array disperso no es un array de `undefined` y por qué el fallback de `getOrInsertComputed` pregunta `has`. El feedback puede corregir una confusión de presencia con valor; tu corrección revisada queda junto a la respuesta. Sólo diagnóstico, práctica y evaluación observados producen evidencia y mastery derivado: este README no genera sesiones ni dominio por sí solo.

Dentro de 48 horas, sin apuntes, evaluá tres diseños: tags repetidos recibidos de una API, permisos requeridos frente a permisos otorgados y estado de layout asociado a nodos que otro árbol ya puede descartar. Elegí colección, escribí una operación central y justificá si necesitás iterar, mutar, preservar orden o depender de la vida del objeto. Si cambia una respuesta, anotá qué invariante cambió: ésa es la corrección que vale conservar.

## Referencias primarias

- [ECMA-262 2026: Array objects](https://tc39.es/ecma262/2026/multipage/indexed-collections.html#sec-array-objects)
- [ECMA-262 2026: Map objects](https://tc39.es/ecma262/2026/multipage/keyed-collections.html#sec-map-objects)
- [ECMA-262 2026: Set objects y álgebra](https://tc39.es/ecma262/2026/multipage/keyed-collections.html#sec-set-objects)
- [ECMA-262 2026: WeakMap y WeakSet](https://tc39.es/ecma262/2026/multipage/keyed-collections.html#sec-weakmap-objects)
- [ECMA-262: Map.prototype.getOrInsert](https://tc39.es/ecma262/multipage/keyed-collections.html#sec-map.prototype.getorinsert)
