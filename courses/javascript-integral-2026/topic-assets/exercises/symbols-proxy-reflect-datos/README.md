# 3.3 — symbols proxy reflect datos

## Por qué importa

Symbol() crea identidad única. Symbol.iterator implementa el protocolo iterable; Symbol.for usa un registro compartido. Aprenderlo como regla de ejecución permite depurar salidas sorprendentes, no sólo repetir sintaxis.

## Objetivos observables

Al finalizar podés definir cada concepto, predecir los ejemplos, identificar el límite de runtime y escribir una versión que falle de manera explícita ante una entrada inválida.

## Etiqueta de estándar y runtime

El núcleo se apoya en ECMAScript. Las APIs de navegador y Node pertenecen al host. Una feature reciente debe detectarse: estar en la edición 2026 no convierte el soporte en universal.

## Modelo mental, paso a paso

### Symbol y well-known symbols

Symbol() crea identidad única. Symbol.iterator implementa el protocolo iterable; Symbol.for usa un registro compartido.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### traps e invariantes de Proxy

Un trap intercepta operaciones. No puede mentir sobre propiedades no configurables ni sobre extensibilidad: el motor lanza TypeError.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### operaciones fundamentales con Reflect

Reflect.get, set, defineProperty y apply expresan la operación base y devuelven resultados útiles para traps.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### JSON, reviver, replacer y acceso a source en ES2026

JSON sólo representa datos JSON: omite undefined y funciones, no soporta ciclos ni BigInt. replacer/reviver transforman; acceso a source ES2026 requiere feature detection.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### structured clone como algoritmo de plataforma

structuredClone es API host: copia Date, Map y buffers soportados; no copia funciones y puede transferir ArrayBuffer, dejando detached el original.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

## Ejemplo resuelto A

    const range={from:1,to:3,*[Symbol.iterator](){for(let n=this.from;n<=this.to;n++)yield n;}};
    console.log([...range]); // [1,2,3]

Resultado esperado: Reflect conserva la semántica normal después de validar.

Trazá cada línea antes de ejecutarla: anotá los bindings, la operación y el efecto visible. Si una línea depende del host, probala en el runtime objetivo.

## Ejemplo resuelto B

    const target={}; const safe=new Proxy(target,{set(obj,key,value){if(key==='age'&&(!Number.isInteger(value)||value<0))throw new RangeError('age');return Reflect.set(obj,key,value);}});
    safe.age=20; console.log(target.age);

Resultado esperado: Reflect conserva la semántica normal después de validar.

## Errores comunes y contraejemplo

Usar Proxy como seguridad, serializar BigInt con JSON sin replacer, asumir structuredClone en todo runtime. El contraejemplo útil es el que viola una única premisa; cambialo, observá el error y explicá por qué la alternativa correcta protege el contrato.

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
