# 2.1 — funciones parametros pila

## Por qué importa

Una declaración de función se inicializa con el scope; una expresión depende de su binding. Arrow no tiene this ni arguments propios y no es constructora. Aprenderlo como regla de ejecución permite depurar salidas sorprendentes, no sólo repetir sintaxis.

## Objetivos observables

Al finalizar podés definir cada concepto, predecir los ejemplos, identificar el límite de runtime y escribir una versión que falle de manera explícita ante una entrada inválida.

## Etiqueta de estándar y runtime

El núcleo se apoya en ECMAScript. Las APIs de navegador y Node pertenecen al host. Una feature reciente debe detectarse: estar en la edición 2026 no convierte el soporte en universal.

## Modelo mental, paso a paso

### declaraciones, expresiones y arrow functions

Una declaración de función se inicializa con el scope; una expresión depende de su binding. Arrow no tiene this ni arguments propios y no es constructora.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### parámetros por defecto, rest y spread

El default se usa sólo con undefined. Rest junta argumentos en array; spread expande un iterable.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### destructuring, argumentos y retorno

Destructuring extrae por patrón; protegé null/undefined con defaults. return termina y entrega un valor.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### funciones como valores y callbacks

Una callback es una función entregada a otra API. El contrato define cuándo, con qué argumentos y cuántas veces se llama.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### pila, recursión y desbordamiento

Cada llamada activa ocupa stack. No hay optimización de tail-call portable; para entradas grandes preferí un loop o estructura explícita.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

## Ejemplo resuelto A

    function sum(...values) { return values.reduce((a, b) => a + b, 0); }
    console.log(sum(...[1, 2, 3])); // 6

Resultado esperado: El loop no agrega una llamada por cada número.

Trazá cada línea antes de ejecutarla: anotá los bindings, la operación y el efecto visible. Si una línea depende del host, probala en el runtime objetivo.

## Ejemplo resuelto B

    function factorialIterative(n) { let result = 1; for (let i=2;i<=n;i++) result*=i; return result; }
    console.log(factorialIterative(5)); // 120

Resultado esperado: El loop no agrega una llamada por cada número.

## Errores comunes y contraejemplo

Convertir toda función a arrow, usar recursión sin límite, asumir que callback es asíncrona. El contraejemplo útil es el que viola una única premisa; cambialo, observá el error y explicá por qué la alternativa correcta protege el contrato.

## Práctica, recuperación y transferencia

1. Ejecutá y modificá los dos ejemplos. 2. Leé el starter: cada TODO tiene un contrato observable. 3. Explicá sin apuntes qué decisión evita el error común. 4. Transferí la idea a una API, UI o servicio propio. Intercalá con el capítulo previo: nombrá una similitud y una diferencia.

## Evaluación diferida

Dentro de 48 horas o más, resolvé un caso nuevo sin consultar el material y registrá una respuesta socrática. Sólo una respuesta observada puede convertirse en evidencia, alimentar el scheduler o acercarte a mastery.

## Referencias primarias

- [ECMA-262](https://tc39.es/ecma262/)
- [Proceso TC39](https://tc39.es/process-document/)
- [Test262](https://github.com/tc39/test262)
- [Node.js API](https://nodejs.org/api/)
- [WHATWG HTML](https://html.spec.whatwg.org/)
