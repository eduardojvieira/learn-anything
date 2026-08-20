# 5.3 — Programación funcional y transformación de datos

## Hacer visible la regla antes de tocar el mundo

En 5.2 viste que una secuencia puede producir valores uno por uno. Acá usamos esa idea para separar una regla de negocio de lo que la rodea. Un resumen de pedidos no necesita abrir una conexión, leer el reloj ni actualizar la pantalla: recibe pedidos y devuelve un resumen. Si un importe cambia “solo”, preguntá qué entrada no estaba escrita en la firma antes de culpar a `reduce`.

La programación funcional no reemplaza a JavaScript ni prohíbe un `for`. Es una forma de elegir funciones y datos para que una transformación pueda predecirse, reutilizarse y corregirse sin seguir estado escondido. Requiere funciones, arrays e identidad de 1.2; la meta es decidir cuándo una regla conviene ser pura, qué contrato tiene un pipeline y dónde quedan los efectos.

## Funciones puras y transparencia referencial

Una función es **pura** cuando el resultado depende sólo de sus argumentos y la llamada no produce cambios observables fuera de su retorno. `conIva(0.21)(100)` siempre devuelve `121`; no lee una variable global ni modifica el importe recibido. Una función pura puede asignar una variable local o crear un array: esos detalles no escapan de la llamada.

```js
const conIva = (tasa) => (importe) => importe * (1 + tasa);
console.log(conIva(0.21)(100)); // 121
let tasa = 0.21;
const precioInestable = (importe) => importe * (1 + tasa);
console.log(precioInestable(100)); // 121
tasa = 0.105;
console.log(precioInestable(100)); // 110.5: el mismo argumento ya no alcanza
```

La consecuencia útil se llama **transparencia referencial**. Como esa llamada vale 121, podés reemplazarla por `121` sin cambiar el programa. Eso hace que un assert sea una descripción de la regla, no una preparación complicada del ambiente.

La segunda función no es transparente porque `tasa` también es entrada, aunque no aparezca en los parámetros. Lo mismo ocurre con `Date.now()`, `Math.random()`, `fetch`, `console.log`, escrituras en un módulo y mutaciones de objetos compartidos. No son cosas malas: son efectos. El problema aparece cuando una regla que parece cálculo depende de ellos sin declararlo.

Pasá la dependencia que realmente varía. Una política de descuento puede recibir la tasa; una regla de vencimiento, `ahora`; un selector aleatorio, una función `random`. No hace falta crear una interfaz para cada número: el objetivo es que las entradas que deciden el resultado estén en el contrato. Una llamada a red o a disco seguirá siendo impura, pero puede quedar en el borde que obtiene datos y llama al núcleo puro.

## `map`, `filter`, `reduce` y `flatMap` dicen formas distintas

No empieces por el método; empezá por la forma del resultado. `map` transforma cada elemento y conserva la cantidad. `filter` conserva algunos elementos. `flatMap` permite que una entrada genere cero, uno o varios valores y aplana **un** nivel. `reduce` combina toda la secuencia en otro valor: un número, un objeto, un `Map` o una estructura de dominio.

```js
const importes = [10, 0, 25];
console.log(importes.map((importe) => importe * 1.21)); // [12.1, 0, 30.25]
console.log(importes.filter((importe) => importe > 0)); // [10, 25]
console.log([[1, 2], [], [3]].flatMap((grupo) => grupo)); // [1, 2, 3]
console.log(importes.reduce((total, importe) => total + importe, 0)); // 35
const pedidos = [
  { estado: 'pagado', items: [{ categoria: 'libros', precio: 10, cantidad: 2 }] },
  { estado: 'pendiente', items: [{ categoria: 'libros', precio: 99, cantidad: 1 }] },
];
const lineas = pedidos
  .filter((pedido) => pedido.estado === 'pagado')
  .flatMap((pedido) =>
    pedido.items.map((item) => ({ ...item, total: item.precio * item.cantidad })),
  );
console.log(lineas); // [{ categoria: 'libros', precio: 10, cantidad: 2, total: 20 }]
```

En pedidos, la forma suele cambiar dos veces: primero descartás los no pagados y después cada pedido se expande a sus líneas. `flatMap` comunica esa expansión mejor que un `map(...).flat()` separado cuando no necesitás observar el array intermedio.

`reduce` requiere valor inicial. Con `0`, una colección vacía factura cero; con `{}` inicia un diccionario vacío. Omitirlo hace que el primer elemento sea acumulador y que `[].reduce(...)` lance `TypeError`. Elegí un acumulador que ya cumpla el contrato del resultado vacío.

No conviertas cualquier recorrido en `reduce`. Si querés “las líneas pagadas”, `filter` y `flatMap` nombran esa intención. Reducí cuando el resultado realmente deja de ser una lista. Tampoco olvides que estos métodos omiten holes de arrays dispersos según la especificación; un array llegado de una API debería ser validado antes de que una transformación silencie una posición ausente.

## Composición, currying y aplicación parcial

La composición conecta la salida de una función con la entrada de otra. Un `pipe` mínimo va de izquierda a derecha y no necesita una biblioteca:

```js
const pipe =
  (...pasos) =>
  (valor) =>
    pasos.reduce((actual, paso) => paso(actual), valor);
const recortar = (texto) => texto.trim();
const mayusculas = (texto) => texto.toUpperCase();
console.log(pipe(recortar, mayusculas)('  ar  ')); // AR
const agregar = (a) => (b) => a + b;
const sumarDiez = agregar(10);
console.log(sumarDiez(5)); // 15
const formatear = (moneda, importe) => `${moneda} ${importe}`;
const pesos = formatear.bind(null, 'ARS');
console.log(pesos(500)); // ARS 500
```

Cada paso necesita respetar el contrato del siguiente. Un pipeline de strings no arregla que un paso devuelva `undefined`; una buena frontera valida antes de entrar. También evitá componer acciones que dependen de `this` sin fijar su receptor: `array.map(obj.metodo)` puede perderlo. Una arrow que llama `obj.metodo(valor)` o `bind` deja la decisión explícita.

**Currying** transforma una función que conceptualmente recibe varios argumentos en llamadas de un argumento: `(tasa) => (importe) => ...`. **Aplicación parcial** fija argumentos y devuelve una función con los restantes. Currying permite parcialidad, pero no son el mismo mecanismo: `f.bind(null, a)` es parcial aunque `f` no esté currificada.

Ordená los argumentos por estabilidad: la tasa que reutilizás primero y el importe que cambia después. No currifiques una función de una sola llamada sólo para que parezca funcional; una firma directa es más honesta. Componer reglas chicas reduce duplicación si cada nombre explica la política, no si oculta una cadena de transformaciones que el lector debe desarmar.

## Inmutabilidad y persistencia no son sinónimos

No mutar una entrada protege a quienes conservan su identidad. La copia con spread crea una raíz nueva, pero es superficial. El objeto externo cambia de identidad; los objetos anidados siguen siendo aliases hasta que copies ese nivel también.

```js
const pedido = { estado: 'nuevo', cliente: { nombre: 'Ana' } };
const enviado = { ...pedido, estado: 'enviado' };
enviado.cliente.nombre = 'Noa';
console.log(pedido.estado, pedido.cliente.nombre); // nuevo Noa
console.log(enviado !== pedido, enviado.cliente === pedido.cliente); // true true
const renombrado = { ...pedido, cliente: { ...pedido.cliente, nombre: 'Noa' } };
console.log(pedido.cliente.nombre, renombrado.cliente.nombre); // Ana Noa
```

Para actualizar el nombre sin tocar el anterior, copiá ambas capas.

`Object.freeze` evita algunas escrituras sobre su propia superficie, pero no congela profundo y no transforma un valor en persistente. Una estructura **persistente** conserva versiones anteriores compartiendo las partes sin cambios; JavaScript no trae una colección persistente estándar. Para estado UI o reglas de pocos niveles, una copia dirigida suele ser suficiente. Si un perfil muestra que copiar una estructura grande domina el costo, recién ahí evaluá una representación especializada y documentá sus garantías de identidad.

Inmutabilidad tampoco exige que jamás exista mutación. Un acumulador local que nadie puede observar puede ser una elección eficiente. El contrato del laboratorio es más fuerte y simple: `resumirPedidosPagos` no cambia `pedidos` ni sus `items`, y su salida no reutiliza el objeto `porCategoria` de una llamada anterior. Ese límite es observable con un fixture congelado o una serialización antes/después.

## Recursión, pereza y efectos controlados

Recursión describe bien un árbol: el caso base decide qué hoja retorna y el paso recursivo combina resultados menores. No podés asumir una optimización de cola consistente en los runtimes objetivo: entradas profundas pueden agotar la pila. Para datos lineales grandes, un `for...of` o una pila explícita suele ser el diseño más robusto. Para árboles profundos, definí un límite o un recorrido iterativo antes de aceptar entrada no confiable.

Un generador puede producir sin materializar todo. Eso es evaluación perezosa: el cuerpo avanza cuando el consumidor pide `next()`. `Array.prototype.map` y `filter` son eager porque crean un array inmediatamente; no los llames “lazy” sólo porque la callback corra después de otra línea.

```js
const sumarHojas = (nodo) =>
  Array.isArray(nodo) ? nodo.reduce((total, hijo) => total + sumarHojas(hijo), 0) : nodo;
console.log(sumarHojas([1, [2, [3]], 4])); // 10
function* paresHasta(limite) {
  for (let numero = 0; numero <= limite; numero += 1) if (numero % 2 === 0) yield numero;
}
const pares = paresHasta(1_000_000);
console.log(pares.next().value, pares.next().value); // 0 2
```

Este ejemplo presupone un árbol acíclico de números; un objeto cíclico no es un árbol y necesita otra política. La recursión no convierte una entrada arbitraria en válida.

La pereza sirve si cortás temprano, combinás una fuente grande o evitás materializar valores. Si siempre consumís todo una sola vez, un array claro puede ser mejor. Los iterator helpers no son una capacidad que puedas suponer en cualquier runtime: hacé feature detection, por ejemplo `typeof Iterator !== 'undefined' && typeof Iterator.prototype.map === 'function'`, antes de usar esa API. Un generador estándar como el ejemplo no requiere esa propuesta.

Por último, ubicá los efectos. El borde imperativo valida/lee un `Request`, llama a la regla pura y escribe la respuesta; el núcleo no importa `fetch` ni toca DOM. Podés testear el núcleo con pedidos concretos y probar el borde por separado. No inventes evidencia V2: una respuesta al diagnóstico socrático, una autoexplicación, la corrección de feedback y una práctica efectivamente ejecutada son las que producen evidencia; el mastery se deriva de ellas, no de que este README declare que entendiste.

## Laboratorio: resumen reproducible de pedidos

En `starter.mjs`, `pipe` debe aplicar pasos de izquierda a derecha. `aplicarIva(tasa)` devuelve una función para importes. `resumirPedidosPagos(pedidos)` recibe un array de pedidos con `estado` e `items`; descarta los no pagados, aplana las líneas y devuelve exactamente `{ lineas, facturacion, porCategoria }`. Cada línea aporta `precio * cantidad`; el resultado vacío es `{ lineas: 0, facturacion: 0, porCategoria: {} }`. No debe mutar la entrada.

`node starter.mjs` empieza RED con asserts que ejecutan el contrato, no con una falla fabricada. Implementá antes de mirar `solution.mjs`; esa referencia termina GREEN y cubre pedidos pendientes, categorías repetidas, array vacío, fixture anidado congelado y resultados sin `porCategoria` compartido. Ejecutá `node solution.mjs` para verificarla.

Pista 1: definí primero el acumulador vacío de `reduce`. Pista 2: `flatMap` recibe un array por pedido; cada item todavía necesita calcular su total dentro del reducer. Pista 3: al sumar una categoría, creá un `porCategoria` nuevo con spread en vez de escribir sobre el anterior.

Está terminado cuando los asserts pasan, el pedido original conserva su JSON y las líneas pendientes no cuentan. Después, explicá en voz alta qué forma tiene el resultado tras `filter`, tras `flatMap` y tras `reduce`; si no podés nombrar esas tres formas, el pipeline todavía es una cadena de símbolos.

Recuperación: ¿qué entrada oculta rompe transparencia referencial? ¿qué conserva `map` que `filter` no? ¿por qué `reduce` necesita identidad para el caso vacío? ¿en qué difieren currying y parcial? ¿qué comparte `{ ...pedido }`? Transferí el laboratorio a dos casos: un reporte de suscripciones activas agrupado por plan y una actualización de carrito que cambie sólo la cantidad de un producto sin mutar el estado anterior.

En 48 horas, sin abrir esta página, escribí una función pura que reciba una tasa y una lista de líneas; después agregá un borde que lea esa tasa de configuración. Justificá dónde queda el efecto, qué input congelarías y qué pasa con un array vacío. Pedí diagnóstico socrático sobre una predicción concreta, registrá tu autoexplicación y corregí sólo el error señalado. La nueva evaluación y su feedback cuentan como evidencia cuando realmente se realizan; V2 deriva el mastery de esa evidencia y de las revisiones, no de una autoevaluación declarada.

## Referencias primarias

- [ECMA-262 2026: funciones y llamadas](https://tc39.es/ecma262/2026/multipage/ecmascript-language-functions-and-classes.html)
- [ECMA-262 2026: `map`, `filter`, `reduce` y `flatMap`](https://tc39.es/ecma262/2026/multipage/indexed-collections.html)
- [ECMA-262 2026: iteración y objetos generador](https://tc39.es/ecma262/2026/multipage/control-abstraction-objects.html)
- [TC39: Iterator Helpers](https://github.com/tc39/proposal-iterator-helpers)
