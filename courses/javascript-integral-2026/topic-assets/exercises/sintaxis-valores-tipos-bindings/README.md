# 1.2 — Sintaxis, valores, tipos y bindings

## La base para no depurar fantasmas

En 1.1 separamos ECMAScript de sus hosts. Ahora estudiamos qué puede leer el parser, qué clase de valor circula y qué relación hay entre un nombre y un valor. Si un dato cambia “solo”, casi siempre hubo una mutación, una reasignación o un alias. Si un salto de línea altera un resultado, el problema es gramática, no magia del motor.

Requiere 1.1. La meta es predecir bordes, elegir correctamente Number o BigInt y describir qué copia una función al recibir un objeto.

## De caracteres a sentencias

La gramática **léxica** convierte caracteres en tokens: identificadores, palabras reservadas, literales, operadores, comentarios y terminadores de línea. La gramática **sintáctica** organiza esos tokens en expresiones, sentencias, declaraciones y bloques. Un comentario puede contener un terminador de línea y, por eso, afectar reglas de inserción automática de punto y coma.

Una **expresión** produce un valor: `2 + 3`, una llamada, `[]` o `{ ok: true }`. Una **sentencia** organiza trabajo: `if`, `return`, `throw`. Una **declaración** introduce un binding: `const total = 5`. Un **bloque** agrupa sentencias y puede crear scope. Las llaves pueden iniciar un bloque o un literal objeto según el lugar en que aparecen; no alcanza con mirar el carácter.

ASI no es “JavaScript pone `;` en cada salto de línea”. Es un algoritmo restringido que actúa sólo en posiciones permitidas y tiene reglas especiales. El borde de `return` es deliberadamente sorprendente:

```js
function respuesta() {
  return;
  {
    ok: true;
  }
}
console.log(respuesta()); // undefined
```

Paso a paso: el salto de línea después de `return` activa la regla restringida y el programa queda como `return;`. Las llaves siguientes forman un bloque separado, no el objeto retornado. Escribí `return { ok: true };` en la misma línea.

El peligro inverso aparece si una línea empieza con `(` o `[`:

<!-- prettier-ignore -->
```js
const etiqueta = 'curso'
[1, 2].forEach(console.log)
```

El parser puede leerlo como `const etiqueta = 'curso'[1, 2].forEach(console.log)`: la coma selecciona el índice `2`, obtiene el carácter `"r"` y luego intenta llamar `forEach` sobre ese resultado. Eso falla, aunque el texto exacto del `TypeError` depende del motor. La versión correcta separa las sentencias:

```js
const etiqueta = 'curso';
[1, 2].forEach((value) => console.log(value)); // 1, luego 2
```

El estilo consistente evita programas válidos con intención equivocada.

También hay diferencia entre FunctionDeclaration y FunctionExpression: `function f() {}` declara un binding, mientras `const f = function () {}` usa una función como valor de una expresión. Esta diferencia será importante para hoisting, pero ya te conviene leer mensajes de parser con precisión: “unexpected token” suele decir que una forma válida apareció en una posición inválida, no que el token sea malo en todos los contextos. Los paréntesis cambian el contexto de una función, y los bloques no devuelven valores como una expresión. Cuando el formato sea ambiguo, escribí una versión con paréntesis, punto y coma o una variable intermedia: comunicarle estructura al lector también le comunica estructura al parser.

## Siete primitivos y objetos

Los siete tipos primitivos son `undefined`, `null`, `boolean`, `number`, `bigint`, `string` y `symbol`. Un primitivo es un valor, no una caja mutable. Objetos son colecciones de propiedades; arrays y funciones también son objetos. Una función tiene `typeof === 'function'` por comodidad histórica, pero es un objeto **callable**, no un octavo primitivo.

| Valor       | `typeof`      | Hecho importante                         |
| ----------- | ------------- | ---------------------------------------- |
| `undefined` | `"undefined"` | usualmente valor no provisto             |
| `null`      | `"object"`    | ausencia intencional; anomalía histórica |
| `false`     | `"boolean"`   | sólo dos valores                         |
| `NaN`       | `"number"`    | no es igual a sí mismo                   |
| `1n`        | `"bigint"`    | entero de dominio separado               |
| `Symbol()`  | `"symbol"`    | identidad única                          |
| `[]`        | `"object"`    | usá `Array.isArray`                      |
| `() => {}`  | `"function"`  | objeto invocable                         |

`null` y `undefined` no son sinónimos. Elegí `null` cuando la ausencia es parte explícita del modelo; `undefined` suele ser un argumento omitido, una propiedad inexistente o una función sin return. `typeof null === 'object'` no es una validación: para objeto no nulo usá `value !== null && typeof value === 'object'`; si arrays no sirven, agregá `!Array.isArray(value)`.

Los strings tienen métodos por boxing temporal, no porque se vuelvan objetos mutables:

```js
const texto = 'sol';
console.log(texto.length); // 3
console.log(texto.toUpperCase()); // "SOL"
console.log(texto); // "sol"
const caja = Object(texto);
caja.color = 'amarillo';
console.log(caja.color); // "amarillo"
```

El motor permite leer propiedades y llamar métodos mediante un envoltorio efímero; `Object(texto)` crea, en cambio, una caja explícita y separada. String sigue siendo inmutable. Asignar una propiedad directamente al primitivo se ignora en código sloppy heredado pero puede lanzar `TypeError` en strict mode o módulos, por eso no es una técnica válida. String usa UTF-16; code points y grafemas se estudian en 4.3.

La inmutabilidad de un primitivo no implica que un binding sea constante. `let palabra = 'sol'; palabra = palabra.toUpperCase()` no muta el string: calcula un string nuevo y reasigna el binding. Esta frase separa tres operaciones que suelen confundirse: transformar un valor, mutar un objeto, y reemplazar el valor asociado a un nombre. En una revisión de código, preguntá siempre cuál de las tres está ocurriendo.

## Números, enteros y símbolos

`Number` usa IEEE-754 binary64: representa fracciones y enteros finitos, pero no todas las fracciones decimales exactamente.

```js
console.log(0.1 + 0.2); // 0.30000000000000004
console.log(Number.isNaN(NaN)); // true
console.log(Object.is(-0, 0)); // false
```

La primera salida es aproximación binaria. `NaN` se detecta con `Number.isNaN`, no con `===`. También existen `Infinity`, `-Infinity` y `-0`; `-0 === 0` da true, pero `Object.is` los distingue cuando el signo tiene semántica.

Los IDs Number tienen un límite de identidad:

```js
console.log(Number.MAX_SAFE_INTEGER + 1 === Number.MAX_SAFE_INTEGER + 2); // true
console.log(Number.isSafeInteger(9007199254740991)); // true
```

Dos enteros matemáticos distintos pueden colapsar en el mismo Number. Validá con `Number.isSafeInteger`. Para enteros arbitrarios usá BigInt:

```js
console.log(10n + 2n); // 12n
console.log(5n / 2n); // 2n
```

BigInt no se mezcla con Number: `1n + 1` lanza `TypeError`; convertí de manera explícita y validada. Su división trunca hacia cero. JSON no representa BigInt nativamente: acordá un string decimal o un esquema, nunca lo conviertas silenciosamente si el ID debe conservarse.

No uses `parseInt` como validador completo de enteros de una API: acepta prefijos y trabaja sobre texto. Primero definí el contrato de entrada, luego convertí y verificá el resultado y el rango. Para dinero tampoco alcanza con “usar BigInt”: tenés que decidir unidad mínima, moneda, redondeo y serialización. El tipo evita una clase de errores; el modelo de dominio decide qué resultado es correcto.

Boolean no es “cualquier valor verdadero”: sólo es `true` o `false`. `Symbol()` crea una identidad nueva incluso con igual descripción; `Symbol.for('app.cache')` consulta un registro global y devuelve el mismo símbolo para la misma clave. Usalo sólo si compartir esa identidad es un contrato.

## Bindings, no cajas

Una declaración crea un **binding**, la inicialización le da valor y una asignación posterior puede reemplazarlo.

```js
let saldo; // declaración
saldo = 10; // asignación
saldo = 12; // reasignación
const moneda = 'ARS'; // debe inicializarse
console.log(saldo, moneda); // 12 ARS
```

`let` y `const` son de bloque. Técnicamente `const` inicia una LexicalDeclaration/StatementListItem, no un Statement directo: no puede ser el cuerpo desnudo de un `if`, pero sí vive dentro de un bloque o en un encabezado `for`. `if (ok) { const x = 1; }` es válido; `// if (ok) const x = 1;` no lo es. `const` impide reasignar el binding, no mutar un objeto alcanzado; `var` es de función/global y tiene semántica histórica, por eso no es la elección por defecto. La TDZ y hoisting se desarrollan en 2.2; hoy, declaralos antes de leerlos.

Un binding tampoco es necesariamente una propiedad del objeto global. Los módulos tienen su propio entorno léxico; incluso en un script, las reglas modernas para `let` y `const` no equivalen al comportamiento heredado de `var`. Evitá escribir código que dependa de un binding global implícito: hace más difícil moverlo entre browser, Node y tests. Si necesitás exponer una API, hacelo explícitamente mediante imports/exports o una propiedad documentada del objeto que corresponda.

```js
const perfil = { nombre: 'Ana', preferencias: { tema: 'paper' } };
perfil.nombre = 'Noa'; // mutación permitida
// perfil = {};        // TypeError: reasigna el binding
console.log(perfil.nombre); // "Noa"
```

## Identidad, aliasing y copia superficial

Los argumentos se pasan **por valor**. Para un objeto, el valor copiado es una referencia: por eso reasignar el parámetro no toca al llamador, pero mutar el objeto alcanzado puede verse desde ambos nombres.

```js
function cambiar(usuario) {
  usuario = { nombre: 'B' };
  return usuario;
}
const original = { nombre: 'A' };
console.log(cambiar(original).nombre, original.nombre); // B A
```

Spread crea una raíz nueva y copia propiedades propias enumerables de string y Symbol. No copia en profundidad:

```js
const user = { name: 'Ana', prefs: { theme: 'paper' } };
const copy = { ...user, name: 'Noa' };
copy.prefs.theme = 'dark';
console.log(user.name, user.prefs.theme); // Ana dark
```

`user !== copy`, pero `user.prefs === copy.prefs`. Para UI o historial inmutable, actualizá cada nivel que requiera identidad nueva; para datos complejos definí la semántica de copia, no asumas que un “clone” genérico preserva prototipos, símbolos y transferencias.

Una comprobación útil al diseñar una API es escribir dos predicciones antes de correrla: “si reasigno el parámetro, el llamador conserva su referencia” y “si escribo `parametro.algo`, todos los aliases observan la propiedad”. Ese par evita la frase vaga “pasaje por referencia” y además revela dónde una función debería devolver un valor nuevo en vez de tocar un input. Si una función promete no mutar, congelá fixtures o compará cuidadosamente la entrada después de invocarla; el laboratorio usa ambas ideas para que el contrato sea observable.

## Laboratorio y aprendizaje real

En `starter.mjs`, `describeValue` devuelve `{ type, category, kind }` y clasifica `null`, NaN, -0, infinitos, los restantes primitivos, array, objeto y callable. `node starter.mjs` empieza RED: implementá hasta GREEN; `solution.mjs` es referencia posterior. `addIntegers` acepta sólo Number seguros homogéneos o BigInt homogéneos y revisa también overflow del resultado. `withName` acepta un registro no-array y no-callable, crea una raíz nueva, conserva símbolos enumerables y deja anidamientos compartidos a propósito.

Pista 1: comprobá `null` antes de `typeof`. Pista 2: `Number.isNaN` y `Object.is(value, -0)` responden preguntas distintas. Pista 3: validá los dos Number y su suma. Está listo cuando pasan los asserts de siete primitivos, callable/array/object, BigInt, mix, overflow, símbolo, raíz distinta y nested alias.

Recuperación: ¿por qué `return` con salto devuelve undefined? ¿cuáles son los siete primitivos? ¿cómo difieren NaN, null y undefined? ¿cuándo elegís BigInt? ¿qué copia spread? Transferí el modelo a un endpoint que reciba IDs mayores al entero seguro y a una actualización de preferencias UI anidada que no mute el estado anterior.

En la sesión V2, respondé primero qué binding e identidad cambiaría cada fragmento. El feedback puede señalar que confundiste `const` con congelamiento; la corrección queda persistida bajo revisión. Sólo diagnóstico, práctica y evaluación efectivamente realizados producen evidencia de mastery. En 48 horas, clasificá `-0`, `NaN`, `1n`, `Symbol.for('x')`, un array y una función; luego diseñá una actualización de preferencias sin aliases residuales.

No intentes convertir esa evaluación en una lista para memorizar. Primero anotá el valor, luego `typeof`, después su categoría real y por último la operación que sería segura. Por ejemplo, `null` requiere una rama de ausencia antes de leer una propiedad; un BigInt requiere un contrato de serialización; un objeto anidado requiere decidir si se permite compartir identidad. Si podés justificar esas cuatro decisiones sin ejecutar nada, ya no estás adivinando tipos: estás modelando datos.

## Referencias primarias

- [ECMA-262 2026: lexical grammar](https://tc39.es/ecma262/2026/multipage/ecmascript-language-lexical-grammar.html)
- [ECMA-262 2026: automatic semicolon insertion](https://tc39.es/ecma262/2026/multipage/ecmascript-language-lexical-grammar.html#sec-automatic-semicolon-insertion)
- [ECMA-262 2026: types and values](https://tc39.es/ecma262/2026/multipage/ecmascript-data-types-and-values.html)
- [ECMA-262 2026: numeric type](https://tc39.es/ecma262/2026/multipage/ecmascript-data-types-and-values.html#sec-ecmascript-language-types-number-type)
- [ECMA-262 2026: statements and declarations](https://tc39.es/ecma262/2026/multipage/ecmascript-language-statements-and-declarations.html)
