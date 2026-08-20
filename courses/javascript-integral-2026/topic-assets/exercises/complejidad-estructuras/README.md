# 5.1 — Complejidad y estructuras de datos compuestas

## Elegir el costo que tu dato puede pagar

Hasta ahora elegiste `Array`, `Map` y `Set` por su semántica. Ahora aparece una pregunta que cambia el diseño: ¿cuánto crece el trabajo cuando crece el dato? Si una API de búsqueda pasa de cien a diez millones de registros, “anda en mi máquina” deja de ser una respuesta. Necesitás describir qué operación se repite, qué estructura la sostiene y qué límite estás aceptando.

Requiere 1.3 y 4.1. La meta es que puedas mirar una operación —encontrar una ruta, sugerir prefijos, mantener prioridades— y justificar estructura, tiempo y espacio sin prometer costos que JavaScript no garantiza.

## Big O mide crecimiento, no segundos

Big O da una cota asintótica: ignora constantes y términos menores para describir cómo escala un algoritmo cuando `n` crece. No dice que `O(n)` sea siempre más rápido que `O(log n)` para entradas chicas; tampoco reemplaza una medición en el runtime y hardware reales. Dice que un recorrido lineal hará trabajo proporcional a los elementos, mientras una búsqueda binaria reduce el espacio de búsqueda a la mitad en cada paso.

Distinguí el tamaño relevante. Buscar un usuario en un array de `n` usuarios es `O(n)`. Buscar una palabra de `k` caracteres en un trie es `O(k)`, aunque haya muchas palabras: el costo sigue los caracteres recorridos. Un recorrido de grafo con `V` vértices y `E` aristas es `O(V + E)`, no “O(n)” sin explicar qué cuenta ese `n`.

```js
function contains(items, target) {
  for (const item of items) if (item === target) return true;
  return false;
}
console.log(contains(['a', 'b', 'c'], 'c')); // true; peor caso O(n), espacio O(1)
```

El retorno temprano mejora algunos casos, pero no el peor caso: una clave ausente fuerza revisar todo. Anotar “`O(n)` peor caso; `O(1)` mejor caso” es más útil que vender `O(1)` por haber encontrado casualmente el primer elemento.

El espacio también cuenta. Esta versión de búsqueda binaria no copia el array: guarda dos índices y un punto medio, `O(1)` auxiliar. Su precondición es crucial: el array debe estar ordenado con la misma comparación que usás para decidir hacia qué mitad ir.

```js
function binarySearch(sorted, target) {
  let low = 0;
  let high = sorted.length - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    if (sorted[middle] === target) return middle;
    if (sorted[middle] < target) low = middle + 1;
    else high = middle - 1;
  }
  return -1;
}
console.log(binarySearch([3, 8, 13, 21], 13)); // 2; O(log n) tiempo, O(1) espacio
```

Si recibís datos no ordenados, ordenarlos para una única consulta cuesta más que el scan; si vas a consultar muchas veces, quizás el índice se paga. `Array.prototype.sort()` además muta y ECMAScript moderno especifica que su resultado es estable; el algoritmo concreto y la complejidad no están especificados. Medí latencia, memoria y distribución de inputs antes de optimizar.

## Pilas, colas, listas y hash tables

Una **pila** es LIFO: el último que entra es el primero que sale. El call stack la usa conceptualmente; para una DFS iterativa también sirve. En un `Array`, `push` y `pop` en el final suelen modelarse como `O(1)` amortizado. No uses `shift` para simular una cola larga: desplaza índices y es `O(n)` por operación.

Una **cola** es FIFO: encola al final y desencola al frente. BFS necesita exactamente esa propiedad para visitar primero la capa de distancia uno, luego la dos. La representación mínima puede ser array más un índice de cabeza; de vez en cuando descartás el prefijo consumido. Una lista enlazada permite inserción/borrado `O(1)` si ya tenés el nodo correcto, pero buscar ese nodo sigue siendo `O(n)` y cada nodo tiene overhead de objetos y referencias. En JavaScript no hay una lista enlazada nativa: no la construyas sólo porque el apunte la nombra.

Una **hash table** asocia clave con bucket. `Map` y `Set` son las elecciones nativas cuando necesitás claves no-string, identidad de objetos y orden de inserción observable. Lookup/inserción/borrado se tratan normalmente como `O(1)` esperado, no como garantía absoluta: colisiones, resize e implementación del motor existen. `Object` sirve para registros simples, pero hereda prototipo y coerciona claves; elegí por el contrato, no por una microoptimización.

```js
const queue = ['api'];
let head = 0;
const seen = new Set(queue);
const graph = new Map([
  ['api', ['auth', 'cache']],
  ['auth', ['db']],
  ['cache', ['db']],
  ['db', []],
]);
while (head < queue.length) {
  const node = queue[head++];
  for (const next of graph.get(node))
    if (!seen.has(next)) {
      seen.add(next);
      queue.push(next);
    }
}
console.log([...seen]); // ['api', 'auth', 'cache', 'db']; BFS: O(V + E)
```

La estructura compuesta es `Map<string, string[]>` más `Set`: adyacencia y visitados. Sin el `Set`, un ciclo como `a → b → a` reencola para siempre. El `head` evita el costo repetido de `shift`; la memoria de la cola, el set y la lista de adyacencia es parte deliberada del costo.

## Árboles, heaps, tries y grafos

Un **árbol** organiza nodos desde una raíz; cada nodo, salvo la raíz, tiene un padre. Un árbol binario de búsqueda mantiene izquierda menor y derecha mayor según una comparación. Si está balanceado, buscar/insertar cuesta `O(log n)`; si insertás valores ya ordenados en una implementación ingenua, se degenera en una cadena `O(n)`. “Árbol” no implica balanceado.

Un **heap binario** no ordena todo: mantiene un invariante local. En un min-heap cada padre es menor o igual que sus hijos; por eso leer el mínimo es `O(1)`, insertar y extraer mínimo son `O(log n)`. No podés hacer búsqueda binaria ni imprimirlo ordenado: para obtener todo ordenado extraés repetidamente. Es ideal para el próximo trabajo más barato, no para consultas arbitrarias.

Un **trie** comparte prefijos. Para autocompletar `mate`, una rama por carácter evita comparar toda palabra contra toda otra. La búsqueda de una clave toma `O(k)` caracteres, aunque el espacio puede crecer mucho si los prefijos comparten poco. Para un diccionario chico, un array ordenado y búsqueda binaria puede ser más simple y más compacto. La estructura correcta depende de lecturas, escrituras, prefijos y memoria, no del prestigio del nombre.

Un **grafo** permite ciclos y varios caminos. Representalo como lista de adyacencia cuando las aristas son dispersas: usa `O(V + E)` espacio y recorrer vecinos es directo. Una matriz de adyacencia usa `O(V²)` pero responde existencia de arista en `O(1)`; se justifica si el grafo es denso y esa consulta domina.

```js
const heap = [2, 5, 3, 9, 8]; // cada padre <= hijos; no está globalmente ordenado
console.log(heap[0]); // 2
const trie = new Map([['c', new Map([['a', new Map([['s', true]])]])]]);
console.log(trie.get('c').get('a').get('s')); // true: “cas” existe
```

El trie del ejemplo es pedagógico: para producción definí si el final de palabra es un flag, cómo guardás frecuencia y qué hacés con Unicode. `for...of` recorre code points, pero “carácter para el usuario” puede ser un grafema; 4.3 cubre esa diferencia.

## Buscar, ordenar y recorrer

BFS usa cola y da el camino con menos aristas en un grafo no ponderado. DFS usa pila o recursión y llega profundo antes de volver; sirve para detectar alcance o producir un orden de salida, pero no promete el camino mínimo. Marcá el nodo como visitado al encolarlo/apilarlo, no al final: así no acumulás duplicados antes de descubrir el ciclo.

Para pesos no negativos, Dijkstra combina grafo, `Map` de mejores distancias y min-heap. El heap elige el candidato más barato conocido; relajar una arista prueba si llegar al vecino mejora su costo. Con heap binario y lista de adyacencia su costo típico es `O((V + E) log V)`. Una arista negativa rompe la decisión greedy: usá Bellman-Ford u otro algoritmo que corresponda.

Esa es la complejidad de libro, no la de este laboratorio. `shortestRoute` copia y compara rutas de hasta `V` nodos para hacer reproducible el desempate lexicográfico, y conserva entradas viejas del heap para ignorarlas al extraer. Como cota conservadora de esta referencia, usá `O(E · V · log E)` de tiempo y `O(E · V)` de espacio auxiliar. Es más caro que guardar sólo predecesores, pero el resultado queda estable y el contrato se puede verificar sin depender del orden de las aristas.

```js
const items = [
  { id: 'b', score: 2 },
  { id: 'a', score: 2 },
  { id: 'c', score: 1 },
];
const ordered = [...items].sort(
  (left, right) => left.score - right.score || left.id.localeCompare(right.id),
);
console.log(ordered.map(({ id }) => id)); // ['c', 'a', 'b']
```

Copiar antes de `sort` conserva la entrada. El segundo criterio hace explícito el desempate: si tu API expone una ruta o ranking, “cualquier empate” suele ser una fuente de tests frágiles y resultados difíciles de explicar.

## Divide and conquer, greedy y programación dinámica

**Divide and conquer** divide un problema en subproblemas independientes, los resuelve y combina. Merge sort divide hasta listas unitarias y luego fusiona: `O(n log n)` tiempo y `O(n)` auxiliar en la versión común. Búsqueda binaria también divide, pero sólo resuelve una mitad por vez.

**Greedy** toma la mejor decisión local sólo cuando podés probar que es segura. Dijkstra es greedy con pesos no negativos: al extraer la distancia mínima, ningún camino pendiente puede mejorarla mediante costos positivos. Elegir siempre la moneda mayor funciona para algunos sistemas de monedas, pero no para todos; no confundas un resultado convincente con una demostración.

**Programación dinámica** aparece cuando subproblemas se solapan y un resultado óptimo se arma desde resultados óptimos menores. Fibonacci recursivo recalcula el mismo valor muchas veces; guardar una tabla evita ese trabajo. El costo cambia de exponencial a `O(n)` tiempo y `O(n)` espacio, o `O(1)` espacio si sólo necesitás los dos estados anteriores.

```js
function minCoins(amount, coins) {
  const best = Array(amount + 1).fill(Infinity);
  best[0] = 0;
  for (let current = 1; current <= amount; current++)
    for (const coin of coins)
      if (coin <= current) best[current] = Math.min(best[current], best[current - coin] + 1);
  return Number.isFinite(best[amount]) ? best[amount] : null;
}
console.log(minCoins(6, [1, 3, 4])); // 2 (3 + 3); greedy 4 + 1 + 1 daría 3
```

No uses DP como un hechizo: la tabla cuesta memoria y el orden de llenado debe respetar dependencias. No uses recursion profunda por estética: Node puede agotar la pila. Elegí un loop iterativo cuando el tamaño pueda venir de input no confiable.

## Laboratorio y aprendizaje real

En `starter.mjs` implementá `shortestRoute(nodes, edges, start, goal)`. El contrato recibe nodos string únicos y aristas dirigidas con costo entero positivo seguro; devuelve `{ cost, path }`, `null` si no hay ruta y, a igual costo, la ruta lexicográficamente menor. El contrato es fail-closed: cualquier costo acumulado que deje de ser un entero seguro durante la exploración lanza `RangeError`, incluso si esa rama no llega a `goal`; `null` sólo significa que el grafo se pudo evaluar sin overflow y el destino es inalcanzable. `node starter.mjs` empieza RED. `solution.mjs` es referencia posterior, no una respuesta para copiar antes de predecir.

Pista 1: construí `Map<nodo, aristas[]>` antes de buscar y rechazá referencias a nodos inexistentes. Pista 2: un min-heap sólo necesita push, pop y comparar primero costo, después la clave de ruta. Pista 3: al mejorar una distancia, insertá otro candidato; al extraer, ignorá los que ya no coinciden con el mejor `Map`.

Está terminado cuando pasan los asserts de ruta más barata, empate estable, origen igual a destino, destino inalcanzable, entradas inválidas y overflow en una rama que no llega al destino. Explicá por qué el heap no ordena todos los nodos, por qué `Set` de nodos valida las aristas y por qué un costo negativo invalida este algoritmo.

Recuperación: ¿qué mide Big O y qué no? ¿por qué `shift` no es una cola escalable? ¿qué invariante mantiene un heap? ¿cuándo BFS da una ruta mínima? ¿qué propiedad falta si Dijkstra recibe un peso negativo? Transferí este modelo a prioridades de trabajos y a sugerencias de prefijos: definí primero qué operación domina y qué empate debe ver la persona usuaria.

En la sesión V2, diagnosticá la elección de estructura antes de ejecutar el código y autoexplicá una relajación de arista. El feedback puede corregir “heap = array ordenado” o “Map = O(1) garantizado”; registrá la corrección en la práctica real. Sólo diagnóstico, práctica, quiz y revisión realmente realizados producen evidencia; mastery se deriva de esa evidencia, no de haber leído este archivo. A las 48 horas, resolvé un grafo chico a mano, proponé un caso que rompa greedy y justificá si una tabla DP paga su espacio.

## Referencias primarias

- [E. W. Dijkstra, _A note on two problems in connexion with graphs_ (1959)](https://doi.org/10.1007/BF01386390)
- [R. Bellman, _On a routing problem_ (1958)](https://doi.org/10.1090/qam/102435)
- [ECMA-262 2026: `Map`](https://tc39.es/ecma262/2026/multipage/keyed-collections.html#sec-map-objects)
- [ECMA-262 2026: `Set`](https://tc39.es/ecma262/2026/multipage/keyed-collections.html#sec-set-objects)
- [ECMA-262 2026: `Array.prototype.sort`](https://tc39.es/ecma262/2026/multipage/indexed-collections.html#sec-array.prototype.sort)
