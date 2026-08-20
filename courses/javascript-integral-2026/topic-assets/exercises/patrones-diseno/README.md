# 6.2 — Patrones de creación, estructura y comportamiento

## Un patrón es un nombre para una tensión real

Un patrón no mejora código por estar escrito con mayúscula. Nombra una solución que vale la pena repetir cuando una tensión concreta aparece: crear variantes sin llenar al llamador de `if`, proteger una API ajena, cambiar una política sin reescribir el flujo o avisar a varios interesados sin que se conozcan entre sí. Si esa tensión no existe, el patrón agrega nombres, archivos y lugares donde mirar.

Venís de 6.1: ya podés modelar responsabilidades, estado y efectos. Ahora la meta es elegir el límite más chico que reduce acoplamiento, y reconocer cuándo una función, un objeto literal o un `import` ya resuelven el problema. No copies catálogos GoF a JavaScript: el lenguaje tiene módulos, closures, funciones de primer orden y eventos que hacen que varias formas clásicas sean mucho más livianas.

## Crear sin hacer del `new` una religión

Una **factory** es una función que devuelve algo con un contrato útil. Oculta una decisión de construcción sólo cuando el llamador no debe conocerla. En JavaScript muchas factories son más claras que una jerarquía de clases porque reciben datos y cierran sobre dependencias:

```js
function createSerializer(format) {
  if (format === 'json') return { encode: JSON.stringify };
  if (format === 'text') return { encode: String };
  throw new RangeError(`Formato desconocido: ${format}`);
}

console.log(createSerializer('text').encode(42)); // "42"
```

Acá la selección varía, pero el consumidor sólo necesita `encode`. Si hay una única variante estable, una factory es un nombre extra: exportá el objeto o la función directamente. Tampoco uses `switch` silencioso con fallback para una configuración crítica; desconocido debe fallar en la frontera.

El **builder** sirve para ensamblar un valor con muchos campos opcionales, dependencias entre campos o una secuencia que mejora la legibilidad. En JavaScript no necesita una clase fluida por defecto. Un literal con defaults y una validación final suele ser el builder más barato:

```js
function buildRequest({ method = 'GET', headers = {}, body } = {}) {
  if (body !== undefined && method === 'GET') throw new TypeError('GET no lleva body');
  return { method, headers: { ...headers }, body };
}

console.log(buildRequest({ method: 'POST', body: 'hola' }).method); // POST
```

Una cadena `request.header(...).timeout(...).retry(...)` se justifica si ordena una construcción genuinamente incremental o impide estados inválidos. Si sólo repite asignaciones, empeora stack traces, tipado y debugging. El objeto de opciones deja visible qué valores entran y permite agregar un campo sin fabricar veinte overloads.

La **inyección de dependencias** cambia quién decide un colaborador. En vez de importar una base de datos, reloj o cliente HTTP dentro del servicio, lo recibís al construirlo. Eso no es un contenedor mágico: pasar un objeto explícito alcanza y hace que la prueba use una dependencia determinista.

```js
function createReminder({ clock, send }) {
  if (typeof clock !== 'function' || typeof send !== 'function')
    throw new TypeError('Dependencias inválidas');
  return (message) => send({ message, sentAt: clock() });
}

const remind = createReminder({ clock: () => '2026-08-20T12:00:00Z', send: console.log });
remind('tomar agua'); // { message: 'tomar agua', sentAt: '2026-08-20T12:00:00Z' }
```

No inyectes cada `Math`, string o helper puro. Inyectá una dependencia cuando cambia por ambiente, tiene efecto, es lenta o su sustitución revela una política. Un service locator global oculta esa relación y vuelve a introducir acoplamiento: si una función necesita `send`, que se lea en su firma o en la factory que la crea.

## Estructura: adaptar un borde, no envolver todo

Un **module** es un límite de nombres y estado. En ESM, cada archivo ya tiene scope de módulo: exportá sólo la API que otros necesitan. Una closure puede encapsular estado por instancia sin clases ni `#private`:

```js
function createCounter() {
  let value = 0;
  return { increment: () => ++value, read: () => value };
}

const counter = createCounter();
console.log(counter.increment(), counter.read()); // 1 1
```

Ese cierre es un module pequeño. Elegilo si cada instancia necesita estado independiente. Para estado compartido deliberado, un binding de módulo y funciones exportadas son más directos. No expongas una referencia mutable “por comodidad”: hacés que cualquiera pueda romper la invariante sin pasar por la API.

Un **adapter** traduce dos contratos incompatibles en el borde. No inventa semántica: decide y documenta cómo mapearla. Por ejemplo, un logger legado que recibe `(level, text)` puede adaptarse a una API que espera un objeto:

```js
function adaptLegacyLogger(write) {
  return { log: ({ level = 'info', message }) => write(level, message) };
}

adaptLegacyLogger((level, text) => console.log(`${level}:${text}`)).log({ message: 'listo' });
// info:listo
```

Validá el lado que controlás y preservá errores del lado ajeno. Un adapter no debería convertir cualquier excepción en `false`: eso borra el diagnóstico. Si cambiar una dependencia afecta muchos callers, un adapter único es más chico y seguro que corregir cada caller.

Una **facade** ofrece una entrada más simple a varios subsistemas. `publishInvoice(id)` puede cargar, validar, serializar y enviar sin obligar a la UI a conocer cuatro módulos. La facade coordina; no debería convertirse en el único objeto que sabe todo. Si acumula reglas de cada dominio, separá las responsabilidades antes de que sea un “god service”.

Un **decorator** conserva el contrato y agrega una preocupación transversal: medición, autorización, reintento o cache. Las funciones hacen esto sin ceremonias:

```js
function withAudit(action, audit) {
  return (input) => {
    audit({ input });
    return action(input);
  };
}

console.log(withAudit((n) => n * 2, console.log)(3)); // { input: 3 }, luego 6
```

El orden importa. `withRetry(withAudit(send))` audita cada intento; `withAudit(withRetry(send))` audita una operación completa. Elegí cuál necesita observabilidad y testealo. Un decorator que cambia tipo de retorno, traga errores o muta argumentos ya no es transparente: quizá sea otra API y merezca un nombre explícito.

## Cambiar conducta sin una escalera de condicionales

**Strategy** concentra una política intercambiable detrás de una función. Elegí una regla cuando hay varias decisiones legítimas y el algoritmo principal no debería conocerlas:

```js
const prices = { regular: (n) => n, vip: (n) => n * 0.9 };
function quote(kind, amount) {
  const strategy = prices[kind];
  if (!strategy) throw new RangeError('Precio desconocido');
  return strategy(amount);
}

console.log(quote('vip', 100)); // 90
```

Un objeto de funciones es suficiente. Crear una clase por estrategia sólo agrega ceremonia hasta que cada variante tenga estado, ciclo de vida o varias operaciones coordinadas. Strategy no borra las reglas: desplaza la elección a un lugar visible y exige que el conjunto de variantes siga siendo entendible.

Un **command** representa una acción como dato: `{ kind: 'archive', id }`, o una función que sabés ejecutar luego. Sirve para colas, undo, permisos o logs porque separa decidir de ejecutar. No conviertas cada llamada local en command; el costo es serialización, validación de payload y manejo de comandos viejos. Si lo persistís, versioná el formato y tratá el payload como entrada no confiable.

**Observer** mantiene una lista de interesados y les notifica cambios. **State** cambia qué comportamiento corresponde según el estado actual. Ambos evitan `if` dispersos, pero responden preguntas distintas: observer pregunta “¿a quién aviso?”; state pregunta “¿qué transiciones son válidas ahora?”.

```js
const transitions = { draft: new Set(['published']), published: new Set(['archived']) };
function transition(current, next) {
  if (!transitions[current]?.has(next)) throw new RangeError(`${current} → ${next} no permitido`);
  return next;
}

console.log(transition('draft', 'published')); // published
```

Una tabla de transiciones es preferible a objetos State cuando hay pocas reglas. Objetos por estado valen cuando cada estado trae varias acciones y efectos coordinados. En ambos casos, modelá el estado imposible como error y no como fallback silencioso.

## Eventos: distinguí quién conoce a quién

**Middleware** es una cadena ordenada: cada pieza recibe contexto y `next`, puede enriquecer, cortar o delegar. Es un decorator coordinado. Su contrato más peligroso es llamar `next` dos veces o después de completar una respuesta. Por eso el laboratorio lo protege: `next` sólo una vez por middleware.

```js
const tag = (ctx, next) => next({ ...ctx, tagged: true });
const terminal = (ctx) => `tagged=${ctx.tagged}`;
console.log(composeMiddleware([tag], terminal)({})); // tagged=true
```

En **pub-sub**, un broker conoce temas y suscriptores; publicador y consumidor no se conocen. Un **event emitter** suele ser un objeto concreto con `on`, `off` y `emit`: conoce listeners locales, como `EventEmitter` de Node. Ambos son variantes de observer, no sustitutos automáticos para una llamada de retorno. Usalos para hechos ocurridos (`invoice.paid`), no para pedir una respuesta necesaria (`calculateTotal`): ahí una función con retorno deja la dependencia y el fallo a la vista.

Los eventos tienen costo: orden, duplicados, listeners que lanzan, vida útil y memoria. Definí si un error corta la emisión, si listeners agregados durante `emit` reciben el evento actual y cómo se desuscriben. En el laboratorio se toma un snapshot: quitar un listener durante la emisión no altera el recorrido actual, y `unsubscribe` es idempotente. Es una política, no una ley universal.

## Antipatrones y costo de abstracción

El antipatron más común es el patrón ceremonial: `UserFactory`, `UserBuilder`, `UserStrategy` y una interface para una sola función estable. Añadiste indirection sin una variación que aislar. Otro es “todo es evento”: perdés el camino de retorno, el orden de efectos y la facilidad de buscar callers. El tercero es una facade gigante o un bus global que permite a cualquier módulo hablar con cualquiera: reduce imports visibles y aumenta el grafo real de dependencias.

Medí el costo antes de abstraer: más contratos que mantener, más saltos al depurar, más estados de ciclo de vida, más tests de integración y más versiones compatibles. Una abstracción paga cuando elimina duplicación de una política que cambia independientemente o protege un borde inestable. No cuando anticipa cinco variantes imaginarias.

Una pregunta práctica por cada propuesta: ¿qué cambio concreto quedaría local mañana? Si la respuesta es “ninguno”, dejá la función directa. Si es “cambiar proveedor, política o protocolo sin tocar quince callers”, elegí el patrón mínimo y poné la validación en su borde.

## Laboratorio: servicio, cadena y bus local

En `starter.mjs` vas a completar `createNotifier`, `composeMiddleware` y `createEventBus`. `createNotifier` es una factory con DI: valida `transport` y `clock`, y su método `send` rechaza texto vacío antes de delegar `{ message, sentAt }`. `composeMiddleware` recibe funciones y un terminal, conserva el contexto que devuelve cada middleware y lanza si uno invoca `next` dos veces. `createEventBus` expone `on` y `emit`; `on` devuelve un unsubscribe idempotente y `emit` recorre un snapshot para que listeners removidos durante la emisión sigan presentes sólo en esa emisión. Un listener duplicado no gana un segundo ownership: su segundo unsubscribe es no-op y sólo el primero puede quitar la suscripción efectiva.

Pista 1: una factory puede retornar un literal; no necesitás `class`. Pista 2: construí la cadena desde el final hacia el principio. Pista 3: copiá el `Set` antes de iterarlo; el Set real sigue siendo dueño de las suscripciones.

Está listo cuando `node starter.mjs` empieza RED y `node solution.mjs` cubre dependencia inválida, mensaje inválido, orden de middleware, doble `next`, listener duplicado con unsubscribe no-op, unsubscribe original y el snapshot. La solución no implementa async, prioridades ni wildcards: agregalos sólo si un contrato real los pide.

Recuperación: ¿cuándo una factory vale más que exportar una función? ¿qué dependencia conviene inyectar? ¿adapter y facade resuelven la misma tensión? ¿qué diferencia observer de state? ¿por qué un evento no reemplaza una consulta con retorno? Transferí el laboratorio a un cliente de pagos con adapter por proveedor y a un flujo de pedido donde `paid` y `cancelled` sean transiciones explícitas.

En V2, antes de ejecutar, explicá qué módulo conoce a cuál y qué ocurre si un listener se elimina durante `emit`. El feedback puede señalar que elegiste eventos para una respuesta síncrona o que un decorator alteró el contrato. Esa corrección, la práctica y la evaluación observadas son evidencia; mastery sigue derivado, no declarado. Dentro de 48 horas, diseñá un caso con una policy de descuento, un adapter de proveedor y un evento de auditoría: justificá qué queda directo y qué desacoplás.

## Referencias primarias

- [ECMA-262 2026: módulos](https://tc39.es/ecma262/2026/multipage/ecmascript-language-scripts-and-modules.html)
- [ECMA-262 2026: funciones](https://tc39.es/ecma262/2026/multipage/ecmascript-language-functions-and-classes.html)
- [Node.js: Events y EventEmitter](https://nodejs.org/api/events.html)
- [Node.js: módulos ECMAScript](https://nodejs.org/api/esm.html)
