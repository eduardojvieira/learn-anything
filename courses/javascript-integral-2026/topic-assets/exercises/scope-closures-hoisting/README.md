# 2.2 — scope closures hoisting

## Por qué importa

Un nombre se resuelve desde el entorno actual hacia los exteriores, según dónde se escribió la función, no dónde se la llamó. Aprenderlo como regla de ejecución permite depurar salidas sorprendentes, no sólo repetir sintaxis.

## Objetivos observables

Al finalizar podés definir cada concepto, predecir los ejemplos, identificar el límite de runtime y escribir una versión que falle de manera explícita ante una entrada inválida.

## Etiqueta de estándar y runtime

El núcleo se apoya en ECMAScript. Las APIs de navegador y Node pertenecen al host. Una feature reciente debe detectarse: estar en la edición 2026 no convierte el soporte en universal.

## Modelo mental, paso a paso

### entornos léxicos y resolución de nombres

Un nombre se resuelve desde el entorno actual hacia los exteriores, según dónde se escribió la función, no dónde se la llamó.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### scope global, de módulo, función y bloque

El módulo no agrega bindings al global. let/const respetan bloque; var respeta función.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### hoisting y zona muerta temporal

Las declaraciones existen antes de ejecutar, pero let/const no se leen antes de inicializar: esa franja es TDZ.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### closures, encapsulación y captura de bindings

Un closure retiene bindings accesibles. Es útil para estado privado; captura el binding vivo, no una copia congelada.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### closures por iteración y retención accidental

let crea binding por iteración; var comparte uno. Una closure que conserva un objeto grande puede mantenerlo alcanzable: soltá referencias cuando termina su uso.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

## Ejemplo resuelto A

    const fns=[]; for (let i=0;i<3;i++) fns.push(()=>i);
    console.log(fns.map(fn=>fn())); // [0,1,2]

Resultado esperado: n no es accesible salvo mediante las operaciones expuestas.

Trazá cada línea antes de ejecutarla: anotá los bindings, la operación y el efecto visible. Si una línea depende del host, probala en el runtime objetivo.

## Ejemplo resuelto B

    function counter(){ let n=0; return {next:()=>++n, reset:()=>{n=0;}}; }
    const c=counter(); console.log(c.next(),c.next()); // 1 2

Resultado esperado: n no es accesible salvo mediante las operaciones expuestas.

## Errores comunes y contraejemplo

Decir que hoisting inicializa todo, usar var en callbacks de loop, capturar caches enormes por accidente. El contraejemplo útil es el que viola una única premisa; cambialo, observá el error y explicá por qué la alternativa correcta protege el contrato.

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
