# 3.2 — prototipos clases composicion

## Por qué importa

Al leer una propiedad se busca primero en el objeto y luego por [[Prototype]]. Delegación comparte comportamiento sin copiar métodos. Aprenderlo como regla de ejecución permite depurar salidas sorprendentes, no sólo repetir sintaxis.

## Objetivos observables

Al finalizar podés definir cada concepto, predecir los ejemplos, identificar el límite de runtime y escribir una versión que falle de manera explícita ante una entrada inválida.

## Etiqueta de estándar y runtime

El núcleo se apoya en ECMAScript. Las APIs de navegador y Node pertenecen al host. Una feature reciente debe detectarse: estar en la edición 2026 no convierte el soporte en universal.

## Modelo mental, paso a paso

### cadena de prototipos y delegación

Al leer una propiedad se busca primero en el objeto y luego por [[Prototype]]. Delegación comparte comportamiento sin copiar métodos.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### funciones constructoras

Una función usada con new expone su prototype a instancias.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### class, extends, super y métodos estáticos

class organiza prototipos. En una subclase hay que llamar super() antes de this. static pertenece a la clase.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### campos y métodos privados, static blocks

#campo es privado léxicamente, no una clave string. Un static block inicializa metadatos al definir clase.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

### herencia frente a composición

Herencia expresa “es un”; composición arma capacidades. Preferí composición cuando las variaciones se combinan.

Preguntá qué valor entra, qué operación se ejecuta, qué valor sale y qué invariante no debe romperse. Esa secuencia evita atribuir al motor una regla que en realidad pertenece al host o a una biblioteca.

## Ejemplo resuelto A

    const canSpeak={speak(){return this.name+' habla';}};
    const person=Object.create(canSpeak); person.name='Ada'; console.log(person.speak());

Resultado esperado: El campo privado no se puede leer como a["#cents"].

Trazá cada línea antes de ejecutarla: anotá los bindings, la operación y el efecto visible. Si una línea depende del host, probala en el runtime objetivo.

## Ejemplo resuelto B

    class Account { #cents=0; deposit(n){if(n<=0)throw new RangeError('n');this.#cents+=n;} get balance(){return this.#cents;} }
    const a=new Account();a.deposit(5);console.log(a.balance);

Resultado esperado: El campo privado no se puede leer como a["#cents"].

## Errores comunes y contraejemplo

Hacer jerarquías profundas, acceder privado por reflexión, olvidar super en derived constructor. El contraejemplo útil es el que viola una única premisa; cambialo, observá el error y explicá por qué la alternativa correcta protege el contrato.

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
