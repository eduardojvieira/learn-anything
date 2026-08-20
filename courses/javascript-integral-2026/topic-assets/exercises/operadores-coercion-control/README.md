# 1.3 — Operadores, coerción y control de flujo

## Elegir una política antes que una sorpresa

Un operador no es sólo un símbolo corto: trae una regla de conversión, orden y control. Este capítulo usa los valores y bindings de 1.2 para responder preguntas de producción: ¿cero significa ausencia?, ¿un puerto recibido como texto es válido?, ¿el cleanup puede esconder el error que queríamos ver? La respuesta correcta no es “JavaScript lo convierte”; es definir y verificar la política.

## Precedencia, asociatividad y cortocircuito

La **precedencia** decide qué operador agrupa primero; la **asociatividad** decide cómo agrupan operadores de igual precedencia. Los paréntesis ganan a memorizar una tabla: `a + b * c` es `a + (b * c)`, pero `(a + b) * c` expresa otra intención. No uses paréntesis para ocultar una condición de cinco ideas: extraé nombres intermedios.

```js
let a, b;
console.log(10 - 3 - 2); // 5: (10 - 3) - 2, asociatividad izquierda
a = b = 7;
console.log(a, b); // 7 7: asignación agrupa a derecha
```

Precedencia y asociatividad agrupan expresiones; el orden observable de evaluación de operandos sigue reglas definidas aparte. No escondas efectos laterales en una expresión compacta sólo porque sabés cómo agrupa.

`&&` y `||` cortocircuitan y devuelven **operandos**, no necesariamente booleans. `&&` devuelve el primer falsy o el último valor; `||` devuelve el primer truthy. El lado derecho no se evalúa si el izquierdo ya decide el resultado:

```js
let llamadas = 0;
const x = 0 && ++llamadas;
const y = 'ok' || ++llamadas;
console.log(x, y, llamadas); // 0 ok 0
```

El `0` evita `++llamadas`; el string truthy también. Esto permite guardas como `obj && obj.metodo()`, pero no valida que el resultado tenga sentido para tu dominio.

`??` sólo reemplaza `null` y `undefined`. Es distinto de `||` cuando `0`, `false` o `''` son válidos:

```js
const guardado = 0;
console.log(guardado || 3000); // 3000
console.log(guardado ?? 3000); // 0
```

No podés mezclar `??` con `&&` o `||` sin paréntesis: `a ?? b || c` es `SyntaxError`. La restricción obliga a expresar la política: `(a ?? b) || c` y `a ?? (b || c)` no significan lo mismo.

Un error habitual es usar `||` como “default” sin haber definido si vacío, cero o false son datos admitidos. Para una prioridad numérica, cero quizá sea válido; para un título, el string vacío quizá deba rechazarse antes de llegar al default. Operadores cortos no reemplazan una validación de frontera. También recordá que la precedencia no cambia el orden de evaluación de todos los efectos: una expresión compacta con llamadas sigue siendo difícil de auditar. Si una rama decide permisos, costos o borrados, preferí condiciones nombradas y una traza testeable.

## ToBoolean no es validación

La conversión ToBoolean vuelve falsy a `false`, `+0`, `-0`, `0n`, string vacío, `null`, `undefined` y `NaN`. Son los falsy ordinarios. `[]`, `{}` y `'0'` son truthy, aunque suenen “vacíos” para una persona. Un caso web excepcional es `document.all`, un exotic legacy del host navegador; no lo uses como regla del lenguaje.

| Entrada | `Boolean(...)` | Pregunta correcta                 |
| ------- | -------------- | --------------------------------- |
| `0`     | false          | ¿cero es un puerto válido?        |
| `''`    | false          | ¿texto faltante o texto inválido? |
| `[]`    | true           | ¿un array es formato admitido?    |
| `'0'`   | true           | ¿es un decimal canónico?          |
| `NaN`   | false          | ¿falló una conversión?            |

`Boolean`, `Number` y `String` convierten explícitamente; eso no vuelve el dato válido. `Number('')` es `0` y `Number(true)` es `1`. Un parser de configuración no debe aceptar esos valores por accidente. Primero definí la representación aceptada, luego convertí y por último validá rango. En el laboratorio un puerto string debe cumplir `/^[1-9]\d*$/`: rechaza vacío, espacios, hex, exponentes y ceros iniciales.

`parseInt` responde otra pregunta: acepta prefijos y puede detenerse antes del final. `parseInt('12px', 10)` devuelve 12, algo útil para un formato específicamente prefijado pero peligroso para configuración. `Number('12px')` da NaN. Ninguna opción es “más JavaScript”: elegí la que coincide con el protocolo. La regex del laboratorio hace visible que `"01"` no es canónico; si tu protocolo sí permite ceros iniciales, modificá esa política y agregá tests que eviten ambigüedad en logs, URLs y serialización.

## Cuatro modelos de igualdad

`===` es Strict Equality: no convierte tipos; objetos se comparan por identidad. `==` es Abstract Equality: realiza conversiones especificadas y existe para compatibilidad, no como parser nuevo.

```js
console.log(null == undefined); // true
console.log('0' == 0); // true
console.log(0 == false); // true
console.log({} === {}); // false
```

El primer caso es una regla especial de nullish; el segundo convierte string a número; el tercero convierte boolean a número; dos literales objeto son identidades distintas. Conocé esos pasos para leer legado, pero elegí `===` y una conversión explícita para contratos nuevos.

`Object.is` usa SameValue: `Object.is(NaN, NaN)` es true y `Object.is(-0, 0)` es false. SameValueZero, usado por `Set`, `Map` e `includes`, también hace coincidir NaN, pero trata +0 y -0 como iguales. Por eso:

```js
console.log(NaN === NaN); // false
console.log(Object.is(NaN, NaN)); // true
console.log([NaN].includes(NaN)); // true
console.log([NaN].indexOf(NaN)); // -1
```

`indexOf` usa estricta y no ve NaN. Elegí la operación por la igualdad que necesitás, no por una costumbre.

Para objetos no existe una comparación estructural automática en estos operadores. Dos objetos con las mismas claves no son idénticos, y el mismo objeto sigue siendo igual a sí mismo aunque una propiedad cambie. Eso ayuda a razonar sobre caches y estado UI: una comparación de referencia puede ser deliberadamente rápida, pero no afirma que los contenidos sean iguales. Si necesitás igualdad de dominio, definila; JSON.stringify tampoco es un reemplazo universal por orden, tipos especiales y ciclos.

## Ramas y bucles que terminan

`if` aplica ToBoolean; escribí una condición que represente la política, por ejemplo `port !== undefined` si cero puede ser válido. El ternario es una **expresión** que produce un valor: `const etiqueta = ok ? 'listo' : 'falló';`. Anidarlo puede ser legal pero ilegible; varias decisiones merecen `if` o una tabla.

`switch` compara `case` con igualdad estricta. `default` cubre lo no reconocido; sin `break`, continúa al caso siguiente. Encerrá cada case que declara bindings en llaves para evitar colisiones y comentá un fall-through intencional.

```js
let trace = [];
switch ('warn') {
  case 'warn':
    trace.push('registrar');
  case 'error':
    trace.push('avisar');
    break;
  default:
    trace.push('desconocido');
}
console.log(trace.join(',')); // registrar,avisar
```

`for` es útil cuando conocés contador o iterable; `while` cuando la condición decide la repetición; `do...while` corre al menos una vez. Todo loop necesita progreso y una condición de salida: `i <= items.length` es un clásico off-by-one. `continue` salta al siguiente ciclo; `break` termina el loop. Una etiqueta sólo sirve para una salida clara de loops anidados:

```js
let found = '';
outer: for (const row of [
  [1, 2],
  [3, 4],
]) {
  for (const n of row)
    if (n === 3) {
      found = `n=${n}`;
      break outer;
    }
}
console.log(found); // n=3
```

No uses labels para reemplazar una función pequeña: aumentan la carga de lectura.

Elegí límites con cuidado. Un contador que recorre `0 .. length - 1` usa `i < length`; `i <= length` intenta una posición inexistente. En un `while`, confirmá qué variable cambia y qué ocurre si la entrada es vacía o el handler falla. `continue` debe corresponder a una condición visible —por ejemplo un registro filtrado— y no esconder trabajo parcial. En procesamientos reales, “terminar” puede requerir también cerrar un recurso, precisamente el tipo de tarea que va en un finally no retornante.

## Fallas, causas y finally

Podés `throw` cualquier valor, pero lanzá `Error`, `TypeError` o `RangeError`: incluyen stack y son clasificables. TypeError comunica representación/tipo incorrecto; RangeError, valor del tipo correcto fuera de su rango. Al envolver una falla, preservá la causa:

```js
try {
  throw new TypeError('socket cerrado');
} catch (cause) {
  throw new Error('No se pudo procesar el lote', { cause });
} finally {
  console.log('cleanup');
}
```

La traza imprime `cleanup` antes de que el error envuelto salga. No supongas que `catch` recibe siempre Error si consumís código ajeno: verificá o rethrow el valor desconocido. `finally` corre ante return, throw y éxito, pero `return` o `throw` **dentro** de finally oculta la finalización pendiente. El callback cleanup **debe completar normalmente**: la API no puede impedir que un throw suyo reemplace return/error pendiente; si falla, necesitás una política explícita, no una agregación improvisada.

No captures todo para “seguir” sin registrar contexto. Un catch demasiado ancho transforma una falla de programación en datos aparentemente válidos. En cambio, agregá contexto de operación —“falló el handler del plan”— y `cause`, que conserva el original para observabilidad. No prometas el texto exacto de errores del motor: tus pruebas deberían verificar clase, causa y resultado observable. Si el cleanup necesita reportar una falla independiente, diseñá ese contrato aparte; un throw desde finally reemplaza la causa que más importaba.

## Laboratorio: parser y plan controlado

`toPort` acepta Number entero finito o texto decimal canónico no vacío. Las representaciones inválidas (`true`, espacio, `0x10`, `01`, decimal, exponente) lanzan TypeError; un número con representación válida pero no entero/rango 1..65535 lanza RangeError. `sameValueZero` implementa `===` o ambos NaN.

`executePlan` recibe comandos `run`, `skip` y `stop`. En éxito o stop retorna `{ results, processed, status }`: processed cuenta cada comando inspeccionado, incluidos skip y stop; status es `completed` o `stopped`. Ante comando inválido o handler fallido, cleanup recibe `{ processed, status: 'failed' }` y se relanza la falla. `skip` usa continue. Callbacks y el array se validan antes del try; sólo la invocación del handler se envuelve con `Error(..., { cause })`, no getters de command ni push de resultados. `node starter.mjs` empieza RED; implementá hasta GREEN y consultá solution sólo después. Cleanup debe completar normalmente: un throw en finally reemplaza el resultado/error original.

Pista 1: distinguí formato de rango antes de llamar Number. Pista 2: guardá resultados en un array y usá break sólo después de registrar stop. Pista 3: el `finally` rodea la operación, no la validación de callbacks. Está listo cuando los asserts cubren éxito, continue, break, desconocido, cause y tres ejecuciones de cleanup.

Una forma de revisar la solución es leer cada comando como una pequeña tabla: `run` agrega un resultado, `skip` no agrega nada y continúa, `stop` agrega la marca y corta, cualquier otro kind falla. Esa tabla evita un switch con fall-through accidental. Los callbacks se validan antes del try: si `cleanup` no es función, la operación no empieza y no hay una limpieza ficticia que pueda ocultar el error de contrato. En producción, documentá si “processed” cuenta skips y stop; este ejercicio lo fija por recorrido para que una métrica no cambie según el valor retornado.

Recuperación: ¿qué retorna `&&`? ¿cuál es la lista falsy? ¿por qué includes encuentra NaN? ¿cuándo cae switch? ¿cómo puede finally ocultar un error? Transferí la política de `toPort` a variables de entorno y diseñá un procesador de lote que devuelva causa de API sin saltarse cleanup.

En V2 respondé el diagnóstico socrático prediciendo la traza antes de ejecutar. El tutor puede corregir una confusión entre `||` y `??` o entre TypeError y RangeError; la corrección revisada queda junto a la respuesta. Sólo práctica y evaluación observadas crean evidencia para mastery. Dentro de 48 horas, sin apuntes, escribí un plan con skip, stop y una falla de handler; justificá resultados, cleanup y la igualdad elegida.

Al corregirte, no reemplaces la explicación por “el test pasó”. Indicá qué operando devolvió el cortocircuito, qué conversión se evitó, qué caso del switch se ejecutó y cuál era la finalización pendiente antes de finally. Esa autoexplicación hace visibles las decisiones que después se transfieren a parsers de variables de entorno, paginación y procesamiento de APIs. Si el resultado fue inesperado, cambiá una sola condición y predecí de nuevo: aprender control de flujo es poder seguir el camino exacto, no recordar una lista de palabras clave.

Registrá también el input exacto: los bordes sólo enseñan algo cuando pueden reproducirse después.

## Referencias primarias

- [ECMA-262 2026: expressions and operators](https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html)
- [ECMA-262 2026: ToBoolean](https://tc39.es/ecma262/2026/multipage/abstract-operations.html#sec-toboolean)
- [ECMA-262 2026: equality algorithms](https://tc39.es/ecma262/2026/multipage/abstract-operations.html#sec-abstract-equality-comparison)
- [ECMA-262 2026: Strict Equality, SameValue y SameValueZero](https://tc39.es/ecma262/2026/multipage/abstract-operations.html#sec-samevaluezero)
- [ECMA-262 2026: statements and loops](https://tc39.es/ecma262/2026/multipage/ecmascript-language-statements-and-declarations.html)
- [ECMA-262 2026: error handling](https://tc39.es/ecma262/2026/multipage/ecmascript-language-statements-and-declarations.html#sec-try-statement)
