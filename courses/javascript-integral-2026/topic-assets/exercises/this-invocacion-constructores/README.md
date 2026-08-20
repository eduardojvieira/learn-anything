# 2.3 — this, invocación, constructores y funciones ligadas

## Por qué importa

`this` no es una variable que una función “recuerda” por tenerla cerca. En una función común, casi siempre lo decide la forma concreta de invocarla. Por eso una línea puede funcionar como método y romperse al pasar exactamente la misma función a un callback. La pregunta útil no es “¿de quién es este `this`?”, sino “¿qué operación de llamada se evaluó y con qué receptor?”.

Esa distinción aparece en código cotidiano: un handler que pierde el estado de una instancia, una utilidad que necesita reutilizar un método sobre otro objeto, una clase llamada sin `new`, o una arrow usada donde hacía falta una función dinámica. Si podés seguir la evaluación, podés predecir el resultado sin probar combinaciones al azar.

## Objetivos observables

Al finalizar podés predecir el `this` de una llamada simple, de un método y de una función ligada; elegir entre `call`, `apply` y `bind`; explicar qué prepara `new`; usar `new.target` para defender un constructor; distinguir una arrow de una función común; y justificar qué cambia con modo estricto, `arguments`, `super` y el orden de evaluación.

## Etiqueta de estándar y runtime

Este capítulo trata semántica de ECMAScript, no una API de Node ni del navegador. En un módulo `.mjs` el código siempre está en modo estricto. Un script clásico puede no estarlo si no declara `'use strict'`; no uses la diferencia como una técnica de compatibilidad. Para comportamiento de un host —por ejemplo, qué `this` entrega un event listener— consultá el contrato de esa API y probalo en el runtime objetivo.

## Modelo mental, paso a paso

### Llamada simple, método y receptor

Una función común recibe su `this` al invocarse. En `f()`, una llamada simple, el valor es `undefined` en modo estricto. En un script clásico no estricto el motor puede sustituir `undefined` o `null` por el objeto global; esa herencia histórica es una razón más para escribir módulos o strict mode.

En `cuenta.depositar(10)`, la referencia de propiedad conserva un receptor: `this` es `cuenta`. No importa dónde fue declarada `depositar`; importa que la llamada salió de esa referencia. Si extraés la función, `const depositar = cuenta.depositar; depositar(10)`, ya no hay receptor. El binding `depositar` contiene una función, no el camino `cuenta.depositar`.

```js
'use strict';
const cuenta = {
  saldo: 20,
  depositar(monto) {
    this.saldo += monto;
    return this.saldo;
  },
};

console.log(cuenta.depositar(5)); // 25; this === cuenta
const operar = cuenta.depositar;
// operar(5); // TypeError: this es undefined
```

El remedio no es guardar “el objeto actual” en una global. Si una API necesita una callback sin receptor, entregale una función ligada o una closure que haga la llamada de método. Si la API provee su propio receptor, no lo tapes con `bind` sin antes leer el contrato.

También separá identidad de receptor. `const otra = { saldo: 0, depositar: cuenta.depositar }; otra.depositar(7)` modifica `otra`, aunque la función nació dentro del literal de `cuenta`. Las funciones comunes son reutilizables porque su `this` es dinámico.

### call, apply y bind

`call` invoca ahora y recibe el receptor seguido de argumentos separados. `apply` también invoca ahora, pero recibe el receptor y un valor array-like de argumentos. `bind` no invoca: produce una función ligada que recordará un `this` y, opcionalmente, argumentos iniciales. Son tres operaciones con resultados distintos, no variantes de estilo.

```js
function etiqueta(prefijo, sufijo) {
  return `${prefijo}${this.nombre}${sufijo}`;
}
const persona = { nombre: 'Ada' };

console.log(etiqueta.call(persona, '[', ']')); // [Ada]
console.log(etiqueta.apply(persona, ['<', '>'])); // <Ada>
const saludarAda = etiqueta.bind(persona, 'Hola, ');
console.log(saludarAda('!')); // Hola, Ada!
```

Usá `call` cuando los argumentos ya están separados. Usá `apply` cuando ya tenés una lista array-like; para un array moderno, `fn(...args)` suele ser más legible si no necesitás elegir explícitamente el receptor. Usá `bind` en un borde de integración: por ejemplo, al pasar un método de instancia como callback. No hagas `bind` en cada render o cada iteración si podés conservar una sola función ligada.

El `this` de una función ya ligada no se reemplaza con otro `call`, `apply` o `bind`; el primero gana para invocaciones normales. Sí se pueden acumular argumentos ligados. Esta regla evita creer que `bind` es una asignación reversible.

```js
function marcar(prefijo, separador, cierre) {
  return `${prefijo}${this.nombre}${separador}${cierre}`;
}
const primero = marcar.bind({ nombre: 'Lin' }, '→ ');
const segundo = primero.bind({ nombre: 'No se usa' }, ' / ');
console.log(segundo('.')); // → Lin / .
```

Los argumentos ligados se anteponen a los de la llamada y se acumulan de izquierda a derecha: `marcar` recibe `'→ '`, `' / '` y `'.'`. El segundo `this` sigue sin efecto: para una llamada normal, el primer `bind` conserva `Lin`.

No confundas `Function.prototype.call` con `Reflect.apply`. Esta última recibe la función por separado (`Reflect.apply(etiqueta, persona, ['(', ')'])`) y puede ser cómoda cuando el callable no conviene obtener como método. Ambas son ECMAScript; ninguna hace que una función no callable se vuelva válida.

### new, new.target y constructores

`new C(...args)` no es sólo “llamar una función con mayúscula”. Primero crea un objeto cuyo prototipo se toma de `C.prototype` (si es un objeto); luego invoca `C` con ese objeto como `this`; finalmente devuelve el objeto creado, salvo que el constructor devuelva explícitamente otro objeto o función. Un primitivo devuelto se ignora.

```js
function Ticket(numero) {
  if (!new.target) throw new TypeError('Ticket requiere new');
  this.numero = numero;
}

const t = new Ticket(42);
console.log(t.numero, t instanceof Ticket); // 42 true
// Ticket(42); // TypeError antes de intentar escribir en this
```

Dentro de una función invocada con `new`, `new.target` es el constructor que abrió la construcción. En una llamada simple vale `undefined`. Permite una defensa explícita para constructores de función. Las clases ya imponen esa defensa: `Clase()` sin `new` lanza `TypeError` por definición.

No uses `new.target` para hacer que una función cumpla dos protocolos incompatibles salvo que el diseño lo exija. Una factory clara devuelve valores; un constructor claro requiere `new`. Si necesitás garantizar una forma compartida, definí métodos en el prototipo o usá una clase, no copies funciones por cada instancia.

Un detalle que importa al depurar: una función ligada puede ser constructora si su función objetivo lo es. `new ligada()` ignora el `this` que se había ligado, pero conserva los argumentos ligados; el objeto nuevo sigue usando el prototipo del objetivo. Una arrow nunca es constructora: no tiene `[[Construct]]`, así que `new (() => {})` falla.

### this léxico en arrows

Una arrow no crea su propio `this`. Lee el `this` léxico del entorno donde fue creada, igual que lee un binding exterior. `call`, `apply` y `bind` no pueden cambiarlo. Por eso funciona bien para una callback interna que debe conservar la instancia, y mal como método reusable cuyo receptor tendría que decidir la llamada.

```js
class Contador {
  #n = 0;
  incrementarLuego(ejecutar) {
    ejecutar(() => ++this.#n);
  }
  valor() {
    return this.#n;
  }
}

const c = new Contador();
c.incrementarLuego((trabajo) => trabajo());
console.log(c.valor()); // 1
```

La arrow se crea durante `incrementarLuego`, cuyo `this` fue `c`; por eso sigue apuntando a `c` aunque `ejecutar` la llame de otra manera. En cambio, escribir un método del objeto como `mostrar: () => this.nombre` suele capturar el `this` exterior del módulo, que en `.mjs` es `undefined`, no el objeto literal. Elegí sintaxis de método para métodos; elegí arrow para capturar el contexto exterior de una callback.

Las arrows tampoco tienen `arguments`, `new.target` ni `super` propios. Una arrow anidada puede acceder léxicamente a esas capacidades del método o constructor que la contiene. No inventa una versión nueva: la conserva desde afuera.

### Modo estricto, arguments, super y evaluación

El modo estricto vuelve visibles errores que el modo histórico escondía. Una llamada simple a una función strict no recibe el global como `this`; recibe exactamente `undefined`. `call(null)` tampoco lo sustituye. No dependas de que un host decida otra cosa: los módulos y los cuerpos de clase son strict siempre.

`arguments` existe en funciones comunes no-arrow y representa los argumentos de esa invocación. No es un `Array`: puede leerse por índice y tiene `length`, pero no trae métodos como `map`. Con parámetros simples y código no estricto hay una relación histórica entre `arguments[0]` y el primer parámetro; en strict mode y con parámetros no simples esa relación no existe. Para código nuevo, `...args` expresa mejor una lista real y evita esa bifurcación.

```js
function revisar(valor) {
  'use strict';
  arguments[0] = 'cambiado';
  return [valor, arguments[0]];
}
console.log(revisar('original')); // ['original', 'cambiado']
```

`super` no significa “el objeto padre”. Sólo es sintaxis válida dentro de definiciones de métodos y constructores de clases (u objetos con método conciso), donde resuelve sobre el prototipo del `[[HomeObject]]` del método. Cuando hacés `super.descripcion()`, la implementación buscada vive arriba, pero se invoca con el `this` actual; eso es crucial para que lea el estado de la instancia derivada.

```js
class Documento {
  descripcion() {
    return `#${this.id}`;
  }
}
class Factura extends Documento {
  constructor(id) {
    super();
    this.id = id;
  }
  descripcion() {
    return `Factura ${super.descripcion()}`;
  }
}
console.log(new Factura('F-7').descripcion()); // Factura #F-7
```

En un constructor derivado, no podés usar `this` antes de `super()`: todavía no existe la instancia inicializada. Esa regla no es capricho; evita que el constructor base pierda la oportunidad de construir su parte del objeto.

Por último, prestá atención a la evaluación. Para `obj.metodo(arg())`, primero se evalúa `obj` y se forma la referencia de propiedad; después se evalúan los argumentos de izquierda a derecha; recién entonces se llama usando el receptor de esa referencia. Si reemplazás la referencia por un valor —por ejemplo `(0, obj.metodo)()`— la llamada queda sin receptor y, en strict mode, `this` es `undefined`. `obj?.metodo()` evita evaluar la llamada si `obj` es `null` o `undefined`; no convierte una propiedad presente pero no callable en función.

## Errores comunes y contraejemplo

El error más repetido es tratar `this` como propiedad de la función. Guardá `obj.metodo` en una variable y compará con `obj.metodo()` para ver el cambio de operación. El segundo es usar arrow para cualquier cosa: como callback interna simplifica; como método que necesita receptor dinámico congela el contexto equivocado. El tercero es usar `bind` como parche sin mirar quién invoca: una API puede esperar elegir su receptor y una función ligada se lo impide.

No llames constructores sin `new` esperando que “igual cree algo”. Una asignación a `this` puede fallar en strict mode o, en código clásico, contaminar el global. La validación con `new.target` hace explícito el contrato cuando usás funciones constructoras. En clases, llamá `super()` antes de tocar `this` en una derivada.

## Laboratorio guiado

Implementá una pequeña `Cuenta` constructora que sólo admita `new`, tenga `depositar(monto)` y permita extraer una callback estable para depositar. El contrato observable: `new Cuenta('Ada', 10).depositar(5)` devuelve `15`; `Cuenta('Ada', 10)` lanza; la callback ligada funciona aunque se la invoque sin receptor; y un monto que no sea un número finito positivo lanza `RangeError` sin modificar el saldo.

1. Empezá por guardar `titular` y `saldo` después de comprobar `new.target`.
2. Hacé que `depositar` valide antes de sumar; después usá `this.depositar.bind(this)` para la callback estable.
3. Probá primero la llamada como método y después la callback extraída. Si el segundo caso falla, anotá si perdiste el receptor o si cambiaste el contrato de validación.

Está terminado cuando `starter.mjs` deja de fallar, tu solución pasa sus asserts y podés explicar por qué `bind` corresponde en este borde pero una arrow no es necesaria para el método.

## Práctica, recuperación y transferencia

Sin ejecutar, respondé: ¿qué vale `this` en una función strict llamada como `f()`? ¿Qué cambia entre `obj.f()` y `const g = obj.f; g()`? ¿`bind` llama ahora o devuelve una función? ¿Qué ocurre con el `this` ligado al hacer `new`? ¿Por qué una arrow no sirve de constructora?

Transferí la regla a dos casos. Primero, revisá un event handler o callback de tu código: decidí si el receptor lo define la API, la instancia o el entorno léxico, y elegí método, `bind` o arrow con esa evidencia. Segundo, convertí una factory pequeña en clase o constructor —o justificá por qué no conviene— y escribí qué pasaría si alguien la llamara sin `new`.

Al dar feedback a otra respuesta, no marques sólo “perdió `this`”. Pedí una traza: expresión de llamada, receptor conservado o perdido, modo de ejecución y salida. Una autoexplicación que nombra esas cuatro piezas permite corregir una regla, no memorizar un parche.

## Evaluación diferida

Dentro de 48 horas, sin consultar este texto, resolvé: una clase derivada recibe un método base que usa `this`; extraés ese método y lo pasás como callback. Explicá qué falla primero y escribí la corrección mínima. Registrá la respuesta socrática y el feedback recibido. Sólo una respuesta observada puede convertirse en evidencia, alimentar el scheduler de V2 o acercarte a mastery derivado; el capítulo no declara sesiones ni dominio.

## Referencias primarias

- [ECMA-262: ECMAScript function objects](https://tc39.es/ecma262/#sec-ecmascript-function-objects)
- [ECMA-262: OrdinaryCallBindThis](https://tc39.es/ecma262/#sec-ordinarycallbindthis)
- [ECMA-262: Function.prototype.call](https://tc39.es/ecma262/#sec-function.prototype.call)
- [ECMA-262: Function.prototype.apply](https://tc39.es/ecma262/#sec-function.prototype.apply)
- [ECMA-262: Function.prototype.bind](https://tc39.es/ecma262/#sec-function.prototype.bind)
- [ECMA-262: EvaluateCall](https://tc39.es/ecma262/#sec-evaluatecall)
- [ECMA-262: Runtime Semantics Evaluation](https://tc39.es/ecma262/#sec-evaluation)
