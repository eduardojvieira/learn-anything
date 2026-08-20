# 1.1 — ECMAScript, motores, hosts y compatibilidad

## La pregunta que evita muchos falsos bugs

Cuando alguien dice «JavaScript no tiene `document`» o «`fetch` ya es parte del lenguaje», está mezclando capas. La confusión parece inocente, pero lleva a aplicaciones que funcionan en una notebook y fallan en CI, en una versión vieja de Node o en un navegador embebido. Este capítulo separa el contrato del lenguaje de las capacidades que cada entorno decide entregar.

Al terminar vas a poder leer una documentación sin adivinar qué promete, preparar una matriz de compatibilidad honesta y explicar por qué “estandarizado” no significa “disponible acá”. No hace falta memorizar una lista de versiones: hace falta saber qué pregunta hacer.

## El mapa de capas

| Capa                  | Responsabilidad                        | Ejemplos                                 | No promete                            |
| --------------------- | -------------------------------------- | ---------------------------------------- | ------------------------------------- |
| ECMAScript / ECMA-262 | Sintaxis y semántica del lenguaje      | `let`, `Map`, clases, módulos, `Promise` | I/O, DOM, temporizadores y event loop |
| Motor                 | Ejecutar esa semántica                 | V8, SpiderMonkey, JavaScriptCore         | una API web o de Node                 |
| Runtime               | Empaquetar motor y políticas           | Node.js, un navegador, Deno              | que otro runtime sea idéntico         |
| Host                  | Ofrecer objetos y operaciones externas | DOM, `fetch`, `process`, filesystem      | que estén en otro host                |

El estándar de lenguaje se llama **ECMAScript** y ECMA International publica su texto como **ECMA-262**. ECMAScript 2026 es la 17.ª edición. Una edición es una foto normativa: sirve para decir “este comportamiento es el que asumimos”. En cambio, el sitio de la especificación es un _living spec_: evoluciona mientras TC39 prepara lo siguiente. Para una decisión reproducible anotá la edición, el runtime y su versión; un enlace a “lo último” no alcanza.

ECMA-262 define la gramática, valores, objetos, funciones, módulos, Promises y algoritmos internos. No define el DOM, I/O, sockets, archivos ni una ventana. **ECMA-402** es otro estándar, dedicado a internacionalización (`Intl.NumberFormat`, `Intl.Segmenter`, etc.). Que veas `Intl` junto a `Array` no hace que ambos tengan el mismo estándar ni la misma disponibilidad.

Probalo sin red ni dependencias:

```js
console.log(typeof Map); // "function" (lenguaje)
console.log(typeof document); // "undefined" en Node
console.log(typeof process); // "object" en Node
```

La primera línea pregunta por una construcción del lenguaje expuesta como intrínseca. Las dos últimas dependen del host. En un navegador el segundo resultado suele ser `"object"` y el tercero `"undefined"`. `typeof identificador` es seguro aun si ese identificador no fue declarado. `globalThis` es el global estándar moderno del Realm actual, pero un target antiguo puede no tenerlo o haberlo alterado: no lo presentes como baseline universal.

## Cómo llega una idea al lenguaje

TC39 es el comité que desarrolla ECMAScript. Sus _stages_ comunican la madurez de una propuesta: una idea temprana no se programa como contrato de producción; Stage 4 significa que el diseño está terminado y entra en el estándar. No significa que cada motor instalado ya lo implementó. Un teléfono con browser sin actualizar, un runtime corporativo congelado o una LTS anterior siguen siendo targets reales.

**Test262** es la suite de conformidad para ECMA-262, ECMA-402 y ECMA-404. Los motores la usan para verificar reglas como coerción, módulos, iteradores e internacionalización, pero su cobertura no es completa. No prueba cámara, DOM, filesystem ni un `fetch` concreto: son APIs host. Por eso «pasa Test262» y «mi aplicación puede hacer una petición» son afirmaciones distintas.

Una regla práctica: antes de adoptar una novedad preguntá (1) ¿está en la edición que declaramos?, (2) ¿la implementan nuestros targets?, (3) ¿la capacidad es lenguaje o host?, (4) ¿cuál es el fallback y quién lo prueba? La respuesta “lo vi anunciado” no responde ninguna.

## Motor, runtime, host, Realm y agente

Un **motor** implementa la máquina abstracta de ECMAScript. Un **runtime** combina un motor con carga de módulos, permisos, I/O, diagnóstico y políticas. Un **host** es la parte que provee las capacidades que ECMA-262 deja abiertas. Un navegador es un host; Node también. Ambos pueden ejecutar la misma expresión y exponer globales muy diferentes.

Un **Realm** contiene un objeto global, un entorno global y sus _intrinsics_: sus propios `Array`, `Object`, `Error`, etc. Eso explica un borde clásico. Este código es **solo Node** porque usa el host API `node:vm`:

```js
import vm from 'node:vm';

const foreign = vm.runInNewContext('[]');
console.log(foreign instanceof Array); // false
console.log(Array.isArray(foreign)); // true
```

`instanceof` sigue la cadena de prototipos contra el constructor `Array` del Realm local. El array creado por `vm` tiene el `Array` del otro Realm. `Array.isArray` consulta si el valor posee la identidad interna de un array, por eso es la prueba adecuada cuando cruzás iframes, contextos de VM o librerías que trabajan con Realms ajenos. `vm` ilustra el concepto; **no es un sandbox de seguridad**. No ejecutes código no confiable allí como solución de aislamiento.

Un **Agent** comprende execution contexts, su stack y running context, un Agent Record y un execution thread. Los jobs se programan para ejecución por un Agent, pero una cola no es un constituyente normativo del Agent. La memoria compartida pertenece al **Agent Cluster**: agentes del mismo cluster pueden compartirla; agentes de clusters diferentes no. Más adelante esto importa para Promises, workers, `SharedArrayBuffer` y `Atomics`. No lo imagines como un único thread del sistema operativo: es un modelo de especificación que el host mapea a recursos concretos.

## APIs host: navegador y Node

`document`, eventos de UI y `localStorage` son capacidades típicas del host web. `process`, `Buffer`, señales y el módulo `node:fs` pertenecen al host Node. `fetch` merece atención: puede existir tanto en un navegador como en Node moderno, pero sigue siendo una API host. Compartir nombre no garantiza idénticos permisos, versiones, límites, caché ni integración con el sistema.

No asumas una API sólo porque aparece en tu máquina. Un probe seguro pregunta por la capacidad exacta y no la invoca todavía:

```js
const supportsStructuredClone =
  typeof globalThis !== 'undefined' && typeof globalThis.structuredClone === 'function';
console.log(supportsStructuredClone); // true o false
```

Para capacidades cuya consulta puede fallar, aislá el probe. Por ejemplo, un wrapper de un SDK podría leer configuración al preguntar:

```js
function inspect(name, probe) {
  try {
    return { name, ok: probe() === true };
  } catch (cause) {
    return { name, ok: false, cause: String(cause) };
  }
}

console.log(
  inspect('configurada', () => {
    throw 'credencial ausente';
  }),
);
// { name: 'configurada', ok: false, cause: 'credencial ausente' }
```

La matriz del laboratorio conserva el fallo y continúa con los demás ítems. Eso es más útil que abortar al primer error: un equipo necesita saber qué falta, qué falló al consultar y qué fallback puede activar.

## Compatibilidad: detectar, transformar o cambiar de estrategia

El user-agent y el número de versión son pistas, no un contrato. Preferí _feature detection_ de la API exacta. También distinguí tres herramientas que se suelen mezclar:

- Un **polyfill** implementa una API con JavaScript cuando la semántica lo permite.
- La **transpilación** reescribe sintaxis antes de que el runtime la parsee.
- Un **fallback** usa una estrategia distinta, por ejemplo mostrar un formulario en lugar de usar una API ausente.

El detalle decisivo es el parser. Un `typeof nuevaAPI` sólo se ejecuta después de que el archivo fue parseado. Si el archivo contiene sintaxis que el runtime no reconoce, nunca llega al `typeof`. Para enseñar la diferencia sin usar `eval` como táctica de producción:

```js
const api = typeof globalThis !== 'undefined' && typeof globalThis.structuredClone === 'function';
console.log(api ? 'usar structuredClone' : 'rechazar la operación con esta semántica');
// "usar structuredClone" o "rechazar la operación con esta semántica"

// La sintaxis nueva se decide en build/entrega: build moderna o build transpilada.
```

Una matriz convierte esa decisión en algo revisable:

| Capacidad                | Target                     | Probe                                                                                   | Fallback                                     | Decisión                         |
| ------------------------ | -------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------- |
| `structuredClone`        | browsers y Node soportados | `typeof globalThis !== 'undefined' && typeof globalThis.structuredClone === 'function'` | algoritmo específico del dominio, o rechazar | no usar JSON como clon implícito |
| `document.querySelector` | browser                    | `typeof document !== 'undefined' && typeof document.querySelector === 'function'`       | no renderizar UI en Node                     | separar entrada web              |
| sintaxis moderna         | browser legado             | build de CI, no `typeof`                                                                | bundle transpilado                           | servir build compatible          |
| `node:fs/promises`       | Node                       | import controlado por entrada Node                                                      | adaptador de almacenamiento                  | nunca importarlo en bundle web   |

La matriz no dice “funciona en versiones recientes”; enumera target, probe y degradación. `typeof document` es seguro si el identificador no existe. `globalThis` es estándar moderno, no una garantía de un target legacy; comprobalo antes de acceder. Ninguna detección runtime rescata sintaxis que el parser no entiende. Pinneá runtime en CI, archivo de toolchain y documentación; el lockfile fija dependencias, no Node. Luego probá los targets declarados.

## Errores que conviene detectar temprano

“V8 soporta algo” no prueba que tu runtime lo exponga. “Stage 4” no obliga a quien mantiene una versión anterior. “`fetch` existe en ambos” no vuelve su entorno intercambiable. “`instanceof Array`” no es una identificación universal. Y “`vm` ejecuta código aislado” no es una promesa de seguridad.

También evitá hacer probes que cambian estado: verificar permisos pidiendo acceso a cámara es una mala prueba de disponibilidad. Primero consultá la superficie no intrusiva; sólo pedí permiso como parte de una acción explícita de usuario. Cuando el fallback altera seguridad o datos, no degradés silenciosamente: informá y detené la operación.

## Laboratorio guiado: una matriz que no miente

Abrí `starter.mjs`. Vas a completar tres funciones:

1. `inspectCapability` valida `{ name, layer, probe, fallback? }`: si `fallback` aparece debe ser un string no vacío. Corre el probe y devuelve `available`, `missing` o `error`. Un retorno que no sea booleano es un error de contrato.
2. `requireCapability` devuelve el reporte disponible. Si falta o el probe falló, lanza un `Error` que nombra la capacidad y el status; si hubo un valor lanzado, lo conserva como `cause`.
3. `capabilityMatrix` inspecciona todos los ítems aunque uno falle, no muta el input y ordena por comparación directa de strings (`<` y `>`), no por locale. Para nombres repetidos conserva su orden de entrada: así el reporte es estable y determinista.

**Pista 1:** validá antes de ejecutar `probe`; una entrada mal formada no es lo mismo que una capacidad ausente. **Pista 2:** `catch (cause)` puede recibir un string, no sólo `Error`. **Pista 3:** al ordenar, guardá el índice original como desempate.

Corré `node solution.mjs` cuando termines. Está listo cuando cubre una capacidad disponible, otra faltante, un `Error`, un string lanzado, datos inválidos, retorno no booleano, propagación de `cause`, empate estable y ausencia de mutación. Esas pruebas son el contrato del catálogo; no reemplaces un fallo por un `try/catch` vacío.

## Recuperación, transferencia y sesión V2

Contestá sin mirar: (1) ¿qué define ECMA-262 y qué no? (2) ¿qué cubre Test262 y qué no garantiza? (3) ¿por qué `Array.isArray` cruza Realms? (4) ¿qué distingue un Agent de un Agent Cluster? (5) ¿por qué una sintaxis nueva no se protege con `typeof`?

Para transferencia, armá una matriz para una app que corre en Node y browser y debe guardar preferencias: separá `localStorage` de filesystem. Después revisá una dependencia tuya: anotá qué feature asume, los runtimes reales que apuntás y la alternativa si no existe.

En Learn Anything V2 iniciá `study` para este concepto, respondé el diagnóstico socrático y guardá tu razonamiento. El dashboard persiste respuesta, feedback y corrección con revisión; sólo una práctica o evaluación realmente realizada genera evidencia. Esa evidencia alimenta mastery, spacing e interleaving: no marques “mastered” por haber leído esta página. A las 48 horas resolvé un caso nuevo: una librería recibe arrays de un iframe y pretende usar una API reciente. Proponé el detector, el bundle y el fallback antes de consultar apuntes.

## Referencias primarias

- [ECMA-262 2026: Scope](https://tc39.es/ecma262/2026/multipage/scope.html)
- [ECMA-262: Execution contexts, Realms y Agents](https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html)
- [Proceso TC39](https://tc39.es/process-document/)
- [Test262](https://github.com/tc39/test262)
- [ECMA-402](https://tc39.es/ecma402/)
- [Node `vm` (no es mecanismo de seguridad)](https://nodejs.org/api/vm.html)
- [WHATWG Web APIs](https://html.spec.whatwg.org/multipage/webappapis.html)
