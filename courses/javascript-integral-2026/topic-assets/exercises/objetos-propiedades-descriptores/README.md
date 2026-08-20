# 3.1 — objetos propiedades descriptores

## Por qué importa

Las claves propias son strings o symbols; [expr] calcula una clave. Aprenderlo como regla de ejecución permite depurar salidas sorprendentes, no sólo repetir sintaxis.

## Objetivos observables

Al finalizar podés definir cada concepto, predecir los ejemplos, identificar el límite de runtime y escribir una versión que falle de manera explícita ante una entrada inválida.

## Etiqueta de estándar y runtime

El núcleo se apoya en ECMAScript. Las APIs de navegador y Node pertenecen al host. Una feature reciente debe detectarse: estar en la edición 2026 no convierte el soporte en universal.

## Modelo mental, paso a paso

### literales, propiedades y claves computadas

Las claves propias son strings o symbols; [expr] calcula una clave.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### enumerabilidad, propiedad y orden de claves

Object.keys ve strings enumerables propios. Índices enteros se ordenan primero, luego strings por inserción y symbols aparte.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### getters, setters y descriptores

Un descriptor es de datos (value/writable) o accessor (get/set). Object.defineProperty omite por defecto enumerable, configurable y writable.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### destructuring, spread y copias superficiales

Spread toma propiedades enumerables propias y sólo copia el primer nivel.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### optional chaining, nullish coalescing, freeze y seal

?. corta sólo ante nullish. freeze bloquea cambios superficiales; seal impide agregar/quitar pero puede permitir editar propiedades existentes.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

## Ejemplo resuelto A

    const user={}; Object.defineProperty(user,'id',{value:42,enumerable:false});
    console.log(Object.keys(user),user.id); // [] 42

Resultado esperado: Spread no clona el objeto interno.

Trazá cada línea antes de ejecutarla: anotá los bindings, la operación y el efecto visible. Si una línea depende del host, probala en el runtime objetivo.

## Ejemplo resuelto B

    const original={prefs:{theme:'paper'}}; const copy={...original};
    copy.prefs.theme='dark'; console.log(original.prefs.theme); // dark

Resultado esperado: Spread no clona el objeto interno.

## Errores comunes y contraejemplo

Suponer freeze profundo, usar Object.assign como validación, olvidar que setter puede ejecutar código. El contraejemplo útil es el que viola una única premisa; cambialo, observá el error y explicá por qué la alternativa correcta protege el contrato.

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
