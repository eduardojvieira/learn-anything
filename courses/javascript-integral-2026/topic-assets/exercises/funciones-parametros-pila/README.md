# 2.1 — Funciones, parámetros y pila de llamadas

## Una función no es una orden: es un valor que podés invocar

Una función junta una operación bajo un nombre o dentro de un valor. Eso parece una comodidad de escritura, pero también fija una frontera: qué datos entran, qué resultado sale y qué trabajo queda escondido adentro. En JavaScript una función es además un objeto invocable; por eso puede viajar en una variable, una propiedad o un argumento. La pregunta útil no es “¿cómo escribo una función?”, sino “¿qué contrato puede predecir quien la llama?”.

Venís de valores, bindings y control de flujo. Ahora la meta es separar declaración de invocación, modelar argumentos ausentes sin aceptar datos ambiguos y reconocer cuándo una llamada recursiva puede agotar la pila. No existe una profundidad de pila portable: depende del runtime, de su configuración y hasta de lo que haga cada frame. Diseñá una cota propia antes de depender de un `RangeError` accidental.

## Declaraciones, expresiones y arrow functions

Una **function declaration** introduce un binding con una forma propia:

```js
function precioConIva(precio) {
  return precio * 1.21;
}
console.log(precioConIva(100)); // 121
const duplicar = function (n) {
  return n * 2;
};
console.log(duplicar(4)); // 8
const esPar = (n) => n % 2 === 0;
console.log(esPar(6)); // true
```

Su binding se crea al entrar al scope; en 2.2 vas a ver el detalle de hoisting. Por ahora, no uses esa propiedad como permiso para llamar antes de declarar: leer de arriba hacia abajo mantiene visible el contrato. Una **function expression** produce una función como valor. Podés guardarla, devolverla o pasarla. La versión con nombre ayuda a una traza y a la recursión local: `const factorial = function calcular(n) { return n === 0 ? 1 : n * calcular(n - 1); };`. El nombre `calcular` vive dentro de esa función; el binding externo sigue siendo `factorial`. No inventes diferencias de rendimiento entre estas formas: elegí la que hace más evidente si necesitás un nombre declarado o un valor que se pasa. Una **arrow function** también es una expresión y achica el caso simple.

El retorno implícito existe sólo sin llaves. `const doble = (n) => n * 2` retorna el cálculo; `const doble = (n) => { n * 2; }` retorna `undefined`. Para retornar un objeto literal, encerralo: `const crear = (id) => ({ id })`. Las arrows no tienen su propio `this`, `arguments`, `super` ni pueden usarse con `new`; capturan el `this` léxico de afuera. Eso es útil en callbacks, pero un método que necesita el receptor dinámico suele ser un método normal, no una arrow pegada a un objeto.

## Parámetros: ausente no significa nulo

Los parámetros son bindings locales inicializados con los argumentos de la llamada. Un default se evalúa cuando el argumento correspondiente es `undefined`, incluso si vino explícitamente:

```js
function saludar(nombre = 'amiga') {
  return `Hola, ${nombre}`;
}
console.log(saludar()); // Hola, amiga
console.log(saludar(undefined)); // Hola, amiga
console.log(saludar(null)); // Hola, null
function sumar(...numeros) {
  return numeros.reduce((total, n) => total + n, 0);
}
const puntos = [3, 4, 5];
console.log(sumar(...puntos)); // 12
```

`null` comunica una ausencia provista; no conviene esconderlo con un default si el contrato lo prohíbe. Validalo o definí qué significa. Los defaults se evalúan de izquierda a derecha y pueden usar parámetros anteriores: `function conectar(host, puerto = host === 'local' ? 3000 : 443) {}`. No hagas defaults con efectos —por ejemplo abrir una conexión— si el llamador no puede ver que suceden. Rest reúne los argumentos restantes en un array real. Spread hace la operación inversa: expande un iterable donde una llamada espera argumentos.

`...numeros` sólo puede ser el último parámetro. Rest no es el viejo objeto `arguments`: tiene métodos de Array y en una arrow ni siquiera existe `arguments` propio. Spread no clona lo que contiene; sólo entrega cada valor. Pasar un array de objetos con `fn(...usuarios)` conserva las mismas referencias a esos objetos.

## Destructuring, argumentos y retorno

Un parámetro objeto permite nombrar lo relevante y documentar la forma cerca de la firma. También permite defaults en dos niveles:

```js
function etiquetaPedido({ id, items = [], note = 'sin nota' } = {}) {
  if (typeof id !== 'string') throw new TypeError('id requerido');
  return { label: `Pedido ${id}`, itemCount: items.length, note };
}
console.log(etiquetaPedido({ id: 'A-1', items: ['mate'] }));
// { label: 'Pedido A-1', itemCount: 1, note: 'sin nota' }
```

El `= {}` cubre el argumento omitido; `items = []` cubre una propiedad `undefined`. Ninguno acepta `null`: destructurar `null` lanza antes de entrar al cuerpo. Si `null` puede venir de una API, validalo antes en una frontera o recibí el objeto completo y validalo antes de desestructurar. Un patrón no valida tipos: `items: 'mate'` cumple la extracción pero no el contrato de array.

Los argumentos se pasan por valor. Cuando ese valor es una referencia a objeto, ambos lados pueden alcanzar el mismo objeto. Reasignar el parámetro no cambia al llamador; mutar una propiedad sí es observable. Preferí devolver un resultado nuevo cuando la función transforma datos y escribí si comparte estructuras anidadas. `return` termina la llamada y entrega un valor; si se omite, el resultado es `undefined`. No uses `return` para comunicar éxito y al mismo tiempo esconder un error: elegí un resultado documentado o lanzá una excepción clasificada.

En funciones normales existe además `arguments`, un objeto array-like con los argumentos recibidos. No lo uses como sustituto de rest: no tiene los métodos de Array y su relación histórica con parámetros simples en código no estricto agrega reglas que no necesitás. `function f(...args) {}` expresa el contrato, funciona igual en módulos y permite operar directamente con `args`. Tampoco confundas cantidad de parámetros con cantidad de argumentos: JavaScript permite extra, que rest puede recoger, y faltantes, que quedan `undefined` si no hay default. La firma debe decidir cuáles son aceptables; ignorarlos silenciosamente es razonable sólo si la API lo documenta.

## Funciones como valores y callbacks

Pasar una función sin paréntesis pasa el valor; poner `()` la invoca ahora. Esa diferencia decide quién controla el momento de ejecución:

```js
function aplicar(valores, transform) {
  return valores.map((valor, indice) => transform(valor, indice));
}
const originales = [10, 20];
console.log(aplicar(originales, (n, i) => n + i)); // [10, 21]
console.log(originales); // [10, 20]
```

`transform` es una callback: `aplicar` define cuántas veces y con qué argumentos la llama. Esa inversión de control exige un contrato: ¿la callback puede lanzar?, ¿puede devolver Promise?, ¿recibe índice?, ¿la colección se muta? El ejemplo usa `map`, por lo que genera un array nuevo, pero no vuelve inmutables los elementos objeto ni impide que la callback los mute. Si el código necesita una función, validá `typeof transform === 'function'` temprano; el mensaje queda bajo tu control en vez de depender de un fallo tardío.

No uses una arrow por reflejo. Una callback pequeña gana claridad con `(value) => value * 2`; una operación con ramas, validación y un nombre útil pide una función nombrada. Tampoco uses callbacks para una llamada única que podrías hacer directa: agregar una capa sólo para “ser funcional” vuelve opaco el flujo.

## Pila de llamadas, recursión y desbordamiento

Al invocar una función, el motor agrega un frame a la **pila de llamadas** con su contexto de ejecución, parámetros y lugar de retorno. La última llamada activa termina primero. Esta traza muestra el orden:

```js
function interna() {
  return 'listo';
}
function externa() {
  return interna();
}
console.log(externa()); // listo
function countdown(n) {
  return n === 0 ? 0 : 1 + countdown(n - 1);
}
console.log(countdown(3)); // 3
```

Si hacés fallar `interna`, mirá la traza: verás que la pila conserva la cadena de llamadas activa. Una traza es una foto del camino, no una especificación de texto estable entre runtimes. La recursión llama a la misma función, directa o indirectamente, y necesita un caso base que no recurse. Para contar, la versión educativa es clara.

Si `n` es negativo, decimal o enorme, el caso base puede no llegar o la pila puede agotarse. JavaScript no garantiza optimización de tail calls en los runtimes usuales; aunque la llamada esté en posición de cola, no la uses como promesa de memoria constante. Para entrada externa, rechazá una profundidad mayor que una cota de negocio o cambiá a un loop. El laboratorio recibe `maxDepth`, pero además fija un techo propio conservador: el llamador no puede elevarlo para forzar `Maximum call stack size exceeded` en Node o un navegador.

No captures un Stack Overflow y sigas como si fuera un error de validación: puede dejar una operación a mitad de camino. Prevenilo con una cota antes de recursar, evitá efectos por frame y preferí una estructura iterativa cuando el tamaño pueda crecer sin límite. La recursión es buena cuando la estructura también es recursiva y la profundidad está acotada por contrato, por ejemplo un árbol de menú con máximo documentado.

## Laboratorio y aprendizaje real

En `starter.mjs`, `summarizeOrder` recibe un registro de pedido, desestructura `id`, `items` y `note`, aplica defaults y devuelve un objeto nuevo. Debe rechazar registros inválidos sin mutar el input. `callWith` valida una función, junta argumentos con rest y los reenvía con spread. `mapValues` valida una callback y usa `map` para no alterar el array de entrada. `countdown` acepta enteros seguros no negativos, rechaza `value > maxDepth` y no permite que `maxDepth` supere el techo propio antes de crecer la pila. `node starter.mjs` empieza RED; implementá hasta GREEN y recién después compará `solution.mjs`.

Pista 1: `typeof null` no alcanza para validar un registro. Pista 2: el default del parámetro no cubre `null`; distinguí representación inválida de valor faltante. Pista 3: validá `value`, `maxDepth` y el techo propio una vez en la frontera pública; el helper recursivo sólo avanza hacia el caso base. Está terminado cuando pasan los asserts de defaults, destructuring, rest/spread, callback, no mutación, caso base y exceso preventivo de profundidad.

Recuperación: ¿cuándo retorna implícitamente una arrow? ¿qué diferencia hay entre `undefined` y `null` frente a un default? ¿qué lado usa rest y cuál spread? ¿quién decide cuándo corre una callback? ¿por qué una recursión necesita caso base y cota? Transferí el contrato a un formateador de perfil que reciba opciones parciales y a un recorrido de categorías cuyo máximo lo imponga el producto, no el runtime.

En V2 empezá por el diagnóstico socrático: antes de ejecutar, dibujá qué argumentos recibe cada frame y qué callback se invoca. Si el feedback marca que confundiste pasar una función con llamarla, corregí esa predicción y justificá dónde aparece cada paréntesis. Esa corrección, la práctica y una evaluación realmente realizadas pueden aportar evidencia; mastery se deriva de esa evidencia, nunca de haber leído este README. En 48 horas, sin apuntes, explicá `fn(...args)`, escribí un default que no esconda `null` y convertí una recursión acotada en un loop, indicando qué estado llevaba cada frame.

Al autoexplicar, nombrá el contrato en vez de decir “anda”: qué inputs acepta, qué salida retorna, qué referencia queda compartida y qué error aparece fuera del rango. Guardá también el input que rompió la primera versión. Esa evidencia permite revisar una corrección concreta; no inventes sesiones, resultados ni dominio donde todavía no los hubo.

## Referencias primarias

- [ECMA-262 2026: function definitions](https://tc39.es/ecma262/2026/multipage/ecmascript-language-functions-and-classes.html)
- [ECMA-262 2026: function calls](https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html#sec-function-calls)
- [ECMA-262 2026: parameter lists](https://tc39.es/ecma262/2026/multipage/ecmascript-language-functions-and-classes.html#sec-function-definitions)
- [ECMA-262 2026: execution contexts and call stack](https://tc39.es/ecma262/2026/multipage/executable-code-and-execution-contexts.html)
- [MDN: Functions](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Functions)
