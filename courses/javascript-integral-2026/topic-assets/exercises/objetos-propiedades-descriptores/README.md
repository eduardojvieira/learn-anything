# 3.1 — Objetos, propiedades y descriptores

## Una propiedad no es sólo un valor pegado a un objeto

En 1.2 distinguimos valores, bindings e identidad. Ahora damos un paso más: un objeto no es una bolsa indiferenciada, sino una colección de propiedades con una clave y atributos. Esa diferencia explica por qué una clave puede existir y no aparecer en `Object.keys`, por qué leer `account.total` puede ejecutar código, y por qué `{ ...account }` parece copiar un estado pero deja un alias escondido en un objeto anidado.

Requiere 1.2 y 1.3. La meta es predecir qué propiedades observa cada operación, elegir un descriptor explícito cuando el contrato lo necesita y no prometer una copia o un bloqueo más profundo de lo que JavaScript realmente entrega.

## Literales, propiedades y claves computadas

Un literal objeto crea un objeto nuevo. Cada propiedad propia tiene una clave que es un string o un Symbol; los números escritos como claves se convierten a string. La notación punto es cómoda para nombres literales válidos como identificador. Los corchetes aceptan una expresión y por eso sirven para nombres dinámicos, nombres con guiones y Symbols.

```js
const field = 'status';
const token = Symbol('token');
const order = { id: 42, [field]: 'paid', [token]: 'privado', 2: 'dos' };
console.log(order.status, order['id'], order[token], order['2']); // paid 42 privado dos
```

`[field]` se evalúa mientras se crea el literal: no crea una propiedad llamada `field`, sino una llamada `status`. En cambio `{ field: 'paid' }` usa el texto `field` literalmente. También podés asignar y borrar propiedades con `object[key]`, pero no confundas que una operación sea posible con que sea una buena política: una clave recibida desde afuera necesita validación si decide permisos, dinero o un campo sensible.

Una lectura de propiedad busca primero en el objeto y luego puede seguir su cadena de prototipos. `in` pregunta por ambas zonas; `Object.hasOwn(object, key)` pregunta sólo por la propiedad propia. Para un registro recibido como dato, esta última suele expresar mejor el contrato:

```js
const proto = { inherited: true };
const settings = Object.create(proto);
settings.theme = 'paper';
console.log('inherited' in settings); // true
console.log(Object.hasOwn(settings, 'inherited')); // false
console.log(Object.hasOwn(settings, 'theme')); // true
```

No llames `settings.hasOwnProperty(...)` sobre datos externos: el objeto puede no heredar ese método o puede tener una propiedad con ese mismo nombre. `Object.hasOwn` es la API estándar moderna. Si tu runtime objetivo no la ofrece, detectá la capacidad antes de elegir un fallback: `typeof Object.hasOwn === 'function'`. No infieras soporte por user agent ni por la edición de ECMAScript que leíste; la capacidad observable del runtime es el dato relevante.

## Enumerabilidad, propiedad y orden de claves

Que una propiedad sea propia no implica que sea enumerable. Las asignaciones y los literales crean propiedades propias, enumerables, writable y configurables. `Object.defineProperty`, en cambio, pone `false` por defecto en los atributos booleanos que omitís. Es útil para un detalle interno, pero también es una fuente clásica de “la propiedad está, pero mi serialización o mi spread no la ve”.

```js
const user = { name: 'Ana' };
Object.defineProperty(user, 'id', { value: 7 });
console.log(user.id); // 7
console.log(Object.keys(user)); // ['name']
console.log({ ...user }); // { name: 'Ana' }
```

`Object.keys` devuelve las claves string propias enumerables. `Object.getOwnPropertyNames` suma las no enumerables string. `Object.getOwnPropertySymbols` devuelve Symbols propios sin filtrar enumerabilidad. `Reflect.ownKeys` es la vista completa de claves propias: strings y Symbols, enumerables o no. `for...in` es distinto: recorre strings enumerables, incluso heredados; evitá usarlo para serializar un registro salvo que esa herencia sea parte explícita del modelo.

El orden de claves propias tampoco es “el orden textual” sin más. Las claves que son índices de array válidos se listan primero en orden numérico ascendente; después vienen los strings restantes por inserción; finalmente los Symbols por inserción. Ese orden se usa, entre otras operaciones, en `Object.keys`, `Object.entries`, `Reflect.ownKeys` y el spread, con el filtro de cada API.

```js
const sample = { 10: 'diez', 2: 'dos', first: 'A', second: 'B' };
console.log(Object.keys(sample)); // ['2', '10', 'first', 'second']
```

No conviertas ese detalle en una política de negocio frágil. Si necesitás mostrar o persistir un orden semántico, modelalo como array o guardá un campo de posición. El orden especificado te permite explicar una salida; no reemplaza una decisión de producto.

## Getters, setters y descriptores

Un descriptor de datos contiene `value`, `writable`, `enumerable` y `configurable`. Un descriptor accessor contiene `get`, `set`, `enumerable` y `configurable`; no puede mezclar `value` o `writable` con `get` o `set`. Consultalo con `Object.getOwnPropertyDescriptor` antes de asumir qué hace una lectura.

```js
const point = {};
Object.defineProperty(point, 'x', {
  value: 3,
  writable: false,
  enumerable: true,
  configurable: false,
});
console.log(Object.getOwnPropertyDescriptor(point, 'x').writable); // false
// point.x = 4; // TypeError en este módulo; x sigue valiendo 3
```

En módulos, JavaScript corre en strict mode, por eso asignar una propiedad no writable lanza. En código heredado no estricto puede fallar silenciosamente; el contrato correcto no depende de ese silencio. Un descriptor no configurable tampoco se puede borrar ni redefinir libremente. Elegí esos límites cuando de verdad forman parte de la API: hacer todo no configurable por costumbre vuelve más difícil evolucionar y testear.

Un getter parece una lectura, pero puede ejecutar código. Un setter parece una asignación, pero puede validar, transformar o lanzar. Por eso no pongas I/O, mutación escondida o trabajo costoso detrás de una propiedad que el lector espera barata. Este ejemplo guarda el estado privado en un closure y deja una frontera observable:

```js
let celsius = 20;
const temperature = {
  get celsius() {
    return celsius;
  },
  set celsius(next) {
    if (!Number.isFinite(next)) throw new TypeError('temperatura inválida');
    celsius = next;
  },
};
temperature.celsius = 21;
console.log(temperature.celsius); // 21
```

El setter valida antes de cambiar el estado. Esa secuencia importa: si `NaN` llega, el objeto conserva la última temperatura válida. Un getter sin setter es efectivamente de sólo lectura desde esa interfaz, aunque su valor pueda venir de otro estado mutable. Cuando expongas accessors, documentá qué lectura o asignación puede fallar y verificá que no sorprendan a quien enumera, copia o inspecciona el objeto.

## Destructuring, spread y copias superficiales

Destructuring extrae propiedades hacia bindings. Podés renombrar, elegir defaults y capturar el resto. Los defaults sólo aplican a `undefined`, no a `null`; si `null` también significa ausencia, decidilo con `??` después de desestructurar.

```js
const profile = { name: 'Ana', preferences: { theme: 'paper' }, role: 'student' };
const { name: displayName, preferences, ...metadata } = profile;
console.log(displayName, preferences.theme, metadata.role); // Ana paper student
```

El spread de objetos crea una raíz nueva y copia las propiedades propias enumerables de string y Symbol. No copia descriptores: al copiar un accessor obtiene su valor; tampoco preserva el prototipo. Sobre todo, no hace una copia profunda: si una propiedad contiene un objeto, ambas raíces reciben el mismo valor-referencia.

```js
const original = { preferences: { theme: 'paper' } };
const copy = { ...original, name: 'Noa' };
copy.preferences.theme = 'dark';
console.log(original.preferences.theme, original === copy); // dark false
```

La raíz es distinta; `preferences` es compartida. Para una actualización inmutable de un nivel anidado, copiá cada nivel que cambiás: `{ ...profile, preferences: { ...profile.preferences, theme: 'dark' } }`. No inventes un “deep clone” general para tapar este hecho: puede perder prototipos, Symbols, ciclos, funciones o transferencias según la técnica. `structuredClone` puede servir para datos compatibles cuando el contrato pide una copia profunda, pero no reemplaza una política sobre esas clases de valores ni está disponible sin comprobarlo en todos los runtimes objetivo.

La función `updateProfile` del laboratorio fija un contrato acotado: recibe dos registros, conserva `preferences` del perfil y devuelve una raíz nueva con un `theme` derivado. El patch se usa para campos de primer nivel como `name`; no pretende ser un merge profundo. Esa precisión es más segura que una función llamada `merge` que nadie sabe hasta dónde copia.

## Optional chaining, nullish coalescing, freeze y seal

Optional chaining corta una cadena sólo cuando el valor a su izquierda es `null` o `undefined`. `profile.preferences?.theme` devuelve `undefined` si falta `preferences`; no evita una falla si `profile` mismo es null salvo que escribas `profile?.preferences?.theme`. Tampoco vuelve válida una llamada a un valor presente pero no invocable: `obj.method?.()` sólo evita la llamada si `method` es nullish.

`??` elige el operando derecho sólo para `null` y `undefined`. Es la pareja habitual de `?.` cuando `0`, `false` o `''` son valores válidos:

```js
const theme = profile.preferences?.theme ?? 'system';
const retries = 0;
console.log(theme, retries ?? 3); // paper 0
```

No reemplaces `??` por `||` sin definir el dominio: `retries || 3` devolvería 3 y perdería el cero. Igual que en 1.3, mezclá `??` con `||` o `&&` sólo con paréntesis explícitos.

`Object.seal(object)` impide agregar, borrar o reconfigurar propiedades propias; una propiedad de datos existente que ya era writable puede seguir cambiando. `Object.freeze(object)` además vuelve no writable las propiedades de datos propias. Ambas operaciones son superficiales: no congelan ni sellan automáticamente los objetos alcanzados desde una propiedad.

```js
const sealed = Object.seal({ level: 1, nested: {} });
sealed.level = 2;
sealed.nested.changed = true;
console.log(sealed.level, sealed.nested.changed); // 2 true
const frozen = Object.freeze({ nested: {} });
frozen.nested.changed = true;
console.log(frozen.nested.changed); // true
```

En este módulo, agregar una propiedad sellada o escribir una congelada lanza TypeError. Usá `Object.isSealed` y `Object.isFrozen` para comprobar el estado de la raíz, no como prueba de inmutabilidad transitiva. Estas APIs existen en runtimes JavaScript modernos, pero si un producto tiene una matriz de runtimes no controlada, detectá `typeof Object.freeze === 'function'` y definí qué alternativa segura ofrece la aplicación. No uses una comprobación de versión o user agent como sustituto de esa prueba.

## Laboratorio: perfil visible y configuración bloqueada

En `starter.mjs`, `defineReadOnly` debe definir una propiedad propia enumerable, no writable y no configurable; acepta sólo un registro y una clave string o Symbol. `createTemperature` conserva Celsius finitos mediante getter y setter: tanto el valor inicial como la siguiente asignación inválida lanzan TypeError sin dejar un valor inválido guardado.

`updateProfile(profile, patch)` recibe registros no-array, desestructura el perfil y devuelve una raíz nueva. Su patch es superficial; mantiene el alias de `preferences` a propósito y expone `theme` como `preferences?.theme ?? 'system'`. `lockSettings(settings, mode)` acepta exactamente `seal` o `freeze` y bloquea sólo la raíz. `node starter.mjs` empieza RED; implementá hasta GREEN y consultá `solution.mjs` recién después de poder explicar cada assert.

Pista 1: `Object.defineProperty` no hace enumerable una propiedad por sí solo. Pista 2: guardá la temperatura en una variable closure y validá antes de reasignarla. Pista 3: para una copia superficial, preguntá por separado “¿la raíz cambió?” y “¿qué valores anidados conservan identidad?”. Está listo cuando los asserts cubren descriptor, Symbol, getter/setter, ausencia nullish, alias superficial, seal y freeze.

Recuperación: ¿cuándo preferís `Object.hasOwn` a `in`? ¿qué ve `Object.keys`? ¿qué atributo cambia al usar `defineProperty` sin opciones? ¿qué ejecuta un getter? ¿qué queda compartido después de spread? Transferí el modelo a un DTO que no deba exponer un token interno y a una actualización de estado UI que cambie sólo `preferences.theme` sin mutar el estado anterior.

En la sesión V2, primero respondé el diagnóstico socrático prediciendo qué claves y descriptores se verán antes de ejecutar. El feedback puede corregir que confundiste “propia” con “enumerable” o que llamaste profunda a una copia superficial; la corrección revisada queda junto a esa respuesta. Sólo diagnóstico, práctica y evaluación realmente observados producen evidencia y el mastery derivado: este capítulo no declara ni inventa ninguno.

Dentro de 48 horas, sin apuntes, recibí un objeto con `id` no enumerable, un getter que valida saldo, `preferences: null` y un objeto sellado que contiene otro objeto. Anotá qué muestra cada API de claves, cuál lectura puede ejecutar código, qué default resulta con `?.` y `??`, y qué mutación todavía sería posible. Después explicá cada resultado en voz alta; la autoexplicación convierte una traza en una regla que podés transferir.

## Referencias primarias

- [ECMA-262 2026: objetos](https://tc39.es/ecma262/2026/multipage/ecmascript-data-types-and-values.html#sec-ecmascript-language-types-object-type)
- [ECMA-262 2026: operaciones sobre objetos](https://tc39.es/ecma262/2026/multipage/abstract-operations.html#sec-operations-on-objects)
- [ECMA-262 2026: propiedades de objetos](https://tc39.es/ecma262/2026/multipage/ecmascript-ordinary-and-exotic-objects-behaviours.html)
- [ECMA-262 2026: inicializadores de objetos](https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html#sec-object-initializer)
- [ECMA-262 2026: optional chaining](https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html#sec-optional-chaining)
- [ECMA-262 2026: Object.freeze y Object.seal](https://tc39.es/ecma262/2026/multipage/fundamental-objects.html#sec-object.freeze)
