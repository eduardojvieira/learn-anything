# 2.3 — this invocacion constructores

## Por qué importa

En una función normal this depende de la llamada. obj.method() usa obj; una llamada suelta en strict mode recibe undefined. Aprenderlo como regla de ejecución permite depurar salidas sorprendentes, no sólo repetir sintaxis.

## Objetivos observables

Al finalizar podés definir cada concepto, predecir los ejemplos, identificar el límite de runtime y escribir una versión que falle de manera explícita ante una entrada inválida.

## Etiqueta de estándar y runtime

El núcleo se apoya en ECMAScript. Las APIs de navegador y Node pertenecen al host. Una feature reciente debe detectarse: estar en la edición 2026 no convierte el soporte en universal.

## Modelo mental, paso a paso

### llamada simple, método y receptor

En una función normal this depende de la llamada. obj.method() usa obj; una llamada suelta en strict mode recibe undefined.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### call, apply y bind

call y apply invocan ahora; apply recibe array-like. bind devuelve otra función con this y opcionalmente argumentos iniciales.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### new, new.target y constructores

new crea objeto, lo conecta con prototype y llama el constructor. new.target permite exigir construcción.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### this léxico en arrows

Arrow captura this del entorno; call/apply/bind no lo reemplazan.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### modo estricto, arguments, super y evaluación

Los módulos son strict. arguments no existe en arrow. super sólo tiene sentido dentro de métodos con home object.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

## Ejemplo resuelto A

    'use strict'; const box={n:2, show(){return this.n;}};
    console.log(box.show()); // 2
    const loose=box.show; // loose() lanza porque this es undefined

Resultado esperado: new.target separa llamada constructora de llamada normal.

Trazá cada línea antes de ejecutarla: anotá los bindings, la operación y el efecto visible. Si una línea depende del host, probala en el runtime objetivo.

## Ejemplo resuelto B

    function User(name){ if(!new.target) throw new TypeError('use new'); this.name=name; }
    console.log(new User('Ada').name); // Ada

Resultado esperado: new.target separa llamada constructora de llamada normal.

## Errores comunes y contraejemplo

Usar arrow como método cuando se necesita receptor, perder un método en callback, llamar constructor sin new. El contraejemplo útil es el que viola una única premisa; cambialo, observá el error y explicá por qué la alternativa correcta protege el contrato.

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
