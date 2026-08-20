# 2.2 — Scope, closures, hoisting y módulos léxicos

## Un nombre no busca por todo el programa

Cuando leés `total += precio`, parece que JavaScript "encuentra" dos valores y opera. La parte importante es dónde los encuentra. Cada ejecución crea entornos léxicos: registros de bindings y una referencia al entorno exterior definido por el texto del programa. Resolver un nombre empieza en el entorno actual y sube esa cadena; no busca en el objeto, archivo o proceso entero. Esa regla explica tanto una variable local que tapa una exterior como una closure que sigue funcionando después de que su función retornó.

Este capítulo continúa 2.1. La meta es predecir qué binding se lee, cuándo existe pero todavía no puede leerse, qué queda vivo por una closure y qué dato conviene no retener. No memorices que "todo se hoistea": distinguí creación del binding, inicialización y accesibilidad.

## Entornos léxicos y resolución de nombres

Un entorno léxico nace de la estructura del código, no del orden en que llamás funciones. Una función declarada dentro de `crearInforme` resuelve `moneda` en el lugar donde fue creada, aun si quien la invoca está en otra función con una variable del mismo nombre. A eso se le suele decir alcance léxico o estático.

```js
const moneda = 'ARS';

function crearInforme() {
  const moneda = 'USD';
  return function mostrar(monto) {
    return `${moneda} ${monto}`;
  };
}

const mostrar = crearInforme();
console.log(mostrar(20)); // USD 20
```

`mostrar` primero busca `moneda` en su propia activación; no la tiene. Sigue al entorno de `crearInforme`, encuentra `'USD'` y termina. El `moneda` global no participa. Que `mostrar` se llame desde otro lado no cambia esa cadena: el caller determina argumentos y pila, pero no el entorno léxico que la función recuerda.

El nombre más cercano gana, lo que se llama _shadowing_. Es legal, pero puede volver una revisión engañosa si reutilizás nombres de dominio:

```js
const estado = 'conectado';
function procesar() {
  const estado = 'pendiente';
  if (true) {
    const estado = 'listo';
    console.log(estado); // listo
  }
  console.log(estado); // pendiente
}
procesar();
console.log(estado); // conectado
```

No hay tres valores que "cambian solos"; hay tres bindings distintos. Evitá usar shadowing para abreviar una transformación importante: `totalConDescuento` comunica mejor que otro `total`. En cambio, un índice `i` pequeño dentro de una función corta suele ser local y claro.

La resolución que falla produce `ReferenceError` cuando ningún entorno de la cadena tiene el binding. En módulos y strict mode, una asignación a un nombre inexistente también falla; no crea una global implícita. Declarar las dependencias y pasarlas como parámetros hace que una función pueda moverse entre Node, navegador y tests sin depender del ambiente accidental.

## Global, módulo, función y bloque

El scope global pertenece al programa o realm, pero no conviene tratarlo como una bolsa compartida. En un script clásico de navegador, un `var` global tiene reglas históricas que pueden exponer una propiedad de `globalThis`; `let` y `const` globales no son equivalentes. En Node, cada archivo CommonJS tuvo wrapper propio; un `.mjs` usa el modelo de módulos. No escribas una API que dependa de esa diferencia: exportá e importá.

Un módulo ES tiene su propio entorno léxico. Sus bindings de nivel superior no se vuelven propiedades de `globalThis`, y sus imports son bindings vivos, no una copia al cargar:

```js
// saldo.mjs
export let saldo = 0;
export function acreditar(monto) {
  saldo += monto;
}

// reporte.mjs
import { acreditar, saldo } from './saldo.mjs';
acreditar(5);
console.log(saldo); // 5
```

`saldo` se actualiza porque el import referencia el binding exportado. El módulo es una frontera de nombres, no una promesa de inmutabilidad: `saldo` puede cambiar dentro de `saldo.mjs`; desde `reporte.mjs` no podés reasignar el import. Los ciclos entre módulos existen y vuelven especialmente importante no leer un export antes de que su módulo haya terminado de inicializarlo.

El scope de función contiene parámetros y bindings declarados con `var`, `let`, `const`, funciones y clases según sus reglas. `var` no respeta bloques ordinarios: una declaración dentro de `if` o `for` se asocia a la función envolvente. `let` y `const` sí crean bindings por bloque:

```js
function etiquetas(activo) {
  if (activo) {
    var heredado = 'función';
    const local = 'bloque';
    console.log(heredado, local); // función bloque
  }
  console.log(heredado); // función
  // console.log(local); // ReferenceError
}
etiquetas(true);
```

No uses `var` para modelar estado nuevo: su scope de función y su inicialización con `undefined` hacen más fácil leer un valor antes de asignarlo. Hay excepciones en legado o cuando integrás código generado, pero son una decisión de compatibilidad, no un default. Las llaves de `catch` también aíslan su binding de error; nombralo con precisión si lo reenviás con `cause`.

Un bloque no es sólo formato. Permite limitar la vida y visibilidad de una variable temporal, evita colisiones entre `case` de un `switch` y hace que cada vuelta de ciertos `for` con `let` o `const` tenga un binding propio. Esa última regla resuelve uno de los bugs más conocidos de callbacks.

## Hoisting: creación no significa valor disponible

"Hoisting" es un apodo para reglas que ocurren al preparar un entorno antes de ejecutar sus sentencias. No imagines que el código se mueve al comienzo del archivo. Preguntá tres cosas: ¿el binding ya fue creado?, ¿qué valor tiene?, ¿puedo leerlo ahora?

Una FunctionDeclaration se inicializa con su función al instanciar el entorno de función o módulo, por eso puede llamarse antes de su línea textual:

```js
console.log(doblar(4)); // 8
function doblar(n) {
  return n * 2;
}
```

`var` también crea su binding antes, pero lo inicializa con `undefined`; la asignación queda donde está. Esto no convierte una lectura temprana en buena idea:

```js
console.log(turno); // undefined
var turno = 'mañana';
console.log(turno); // mañana
```

Una FunctionExpression con `const` no recibe ese valor temprano. El binding `const` existe desde que se entra al scope, pero permanece en la **zona muerta temporal** (TDZ) hasta que se evalúa su inicializador. Leerlo antes da `ReferenceError`, no `undefined`:

```js
// console.log(triplicar); // ReferenceError: TDZ
const triplicar = (n) => n * 3;
console.log(triplicar(4)); // 12
```

Lo mismo vale para `let`, `const`, `class` e imports. TDZ no significa que el motor "no conoce" el nombre: significa que detecta una lectura prematura. Esa falla es útil porque impide usar estado no inicializado. `typeof` no la esquiva: `typeof futuro` dentro de su TDZ también lanza `ReferenceError`; sólo `typeof` sobre un nombre completamente no declarado devuelve `'undefined'`.

No bases una interfaz en diferencias de hoisting. Declarar una función antes de usarla puede ser una decisión de legibilidad; si usás `const` para una callback, definila antes de registrarla. Las declaraciones de función dentro de bloques tuvieron semánticas históricas complejas fuera de strict mode: en código moderno, módulos y bloques explícitos eliminan la ambigüedad.

## Closures: estado que sigue teniendo nombre

Una closure es una función junto con los bindings exteriores que puede alcanzar. No copia valores al crearla; conserva acceso al binding. Por eso dos funciones pueden compartir estado privado sin exponer una propiedad mutable:

```js
function crearContador(inicial = 0) {
  let valor = inicial;
  return {
    sumar() {
      valor += 1;
      return valor;
    },
    leer() {
      return valor;
    },
  };
}

const contador = crearContador(3);
console.log(contador.sumar()); // 4
console.log(contador.leer()); // 4
```

`valor` ya no es accesible por nombre desde quien llamó `crearContador`, pero sigue vivo porque `sumar` y `leer` lo necesitan. Eso es encapsulación por closure: escondé el estado y publicá operaciones que preserven el invariante. No lo confundas con seguridad contra código hostil; es una frontera de API, no una sandbox.

La captura es del binding, no de una foto. Si el binding cambia, una closure posterior lee el valor nuevo:

```js
let modo = 'lectura';
const describir = () => `modo: ${modo}`;
modo = 'edición';
console.log(describir()); // modo: edición
```

Si necesitás una foto deliberada, creá otro binding al construir la closure: `const modoInicial = modo; return () => modoInicial`. Elegí por contrato: logs de auditoría quizá necesitan una foto; una vista de estado actual necesita leer el binding vivo. También separá identidad de mutación: capturar un objeto deja a la closure observar mutaciones hechas por otros aliases. Si el contrato pide inmutabilidad, copiá o validá en la frontera; una closure no la crea sola.

## Iteraciones y retención accidental

Con `var`, un loop tiene un único binding de contador para toda la función. Todas las closures creadas en él miran ese mismo binding cuando finalmente corren:

```js
const tarde = [];
for (var i = 0; i < 3; i++) tarde.push(() => i);
console.log(tarde.map((leer) => leer())); // [3, 3, 3]
```

Con `let`, el `for` crea un binding por iteración para las closures. Es la solución directa:

```js
const estable = [];
for (let i = 0; i < 3; i++) estable.push(() => i);
console.log(estable.map((leer) => leer())); // [0, 1, 2]
```

En código heredado, una IIFE podía crear el binding por vuelta, pero hoy agrega ruido: usá `let` o iteradores como `map`, cuyos parámetros también son bindings por llamada. No conviertas todo callback en closure por costumbre; creala cuando tenga que diferir trabajo o preservar estado.

La cara menos visible es la retención accidental. Una closure mantiene alcanzable su entorno exterior; si ese entorno contiene un cache, un payload de request o un árbol grande, puede mantenerse en memoria mientras la callback viva. El recolector decide cuándo liberar memoria y no hay una prueba portable de "ya se recolectó". Lo que sí controlás es qué binding captura la closure:

```js
function crearEtiqueta(registro) {
  const { id, nombre } = registro;
  return () => `${id}: ${nombre}`;
}

const etiqueta = crearEtiqueta({ id: 7, nombre: 'Luz', adjuntoGrande: new Uint8Array(1_000_000) });
console.log(etiqueta()); // 7: Luz
```

La intención es que la callback sólo necesite `id` y `nombre`; extraerlos evita que tu código dependa del registro completo. No afirmes que una optimización de un motor nunca pueda conservar algo más: inspeccioná heap snapshots si existe un problema medido. Para listeners y timers, la solución primaria suele ser también de ciclo de vida: remover el listener, cancelar el timer o soltar la referencia al callback cuando deja de ser necesaria.

## Laboratorio: contador encapsulado y lectores estables

En `starter.mjs`, implementá `createQuota(limit)`, `createItemReaders(items)` y `createLabel(record)`. La cuota acepta un límite entero seguro no negativo y devuelve `take(amount)` y `remaining()`. `take` acepta enteros seguros positivos; si el pedido supera lo restante, lanza `RangeError` sin cambiar el estado. Ese comportamiento prueba que ambas funciones cierran sobre el mismo binding, pero no lo exponen para reasignarlo.

`createItemReaders` acepta sólo un array denso de strings —un hueco no representa un string— y devuelve una función por elemento. Cada lector devuelve el string que le tocó aun después de que terminó el loop: usá un binding por iteración, no un contador `var` compartido. `createLabel` acepta un registro no nulo con `id` Number seguro y `name` string no vacío; extrae esos dos primitivos y devuelve una closure con la etiqueta. Si mutás el registro después, la etiqueta sigue mostrando los valores proyectados al crearla. El contrato no promete una observación de GC: promete que la API no necesita capturar el objeto de entrada para responder.

Pista 1: validá la frontera antes de crear estado; `Array.from` materializa los huecos como `undefined`. Pista 2: `let remaining = limit` debe estar en la función fábrica, no dentro de `take`. Pista 3: un `for...of` con `const item` ya te da el binding por vuelta. Está listo cuando `node starter.mjs` deja de fallar, `node solution.mjs` pasa y los asserts cubren consumo, rollback ante exceso, huecos, iteración y captura de datos proyectados.

Recuperación: ¿cuál binding gana si dos scopes usan el mismo nombre? ¿por qué `var` temprano da `undefined` y `let` temprano falla? ¿una closure captura una foto o un binding? ¿qué devuelve cada callback de un `for (var ...)`? ¿cuándo retirarías un listener que conserva una closure? Transferí el laboratorio a un limitador de reintentos de una API y a una lista de acciones UI que conserva su id por fila.

En V2, empezá por un diagnóstico socrático: trazá los entornos desde la función interna hasta el módulo y justificá cada nombre resuelto. Autoexplicá por qué el intento que excede la cuota no cambia el restante; si fallás, usá el feedback para corregir el contrato y repetí un caso nuevo. Sólo esas respuestas y ejecuciones realmente observadas pueden producir evidencia para el scheduler y mastery derivado; este README no declara dominio por vos. Dentro de 48 horas, sin apuntes, corregí `[() => i, () => i]` producido con `var`, explicá una TDZ y diseñá la limpieza de un listener que ya no se usa.

## Referencias primarias

- [ECMA-262: execution contexts](https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html)
- [ECMA-262: ECMAScript language functions](https://tc39.es/ecma262/multipage/ecmascript-language-functions-and-classes.html)
- [ECMA-262: declarations and the global object](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html)
- [ECMA-262: modules](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html#sec-modules)
- [Node.js: ECMAScript modules](https://nodejs.org/api/esm.html)
