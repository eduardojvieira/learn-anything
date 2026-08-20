# 11.3 — Arquitectura avanzada y fronteras del sistema

## El límite que te deja cambiar sin pedir permiso

Una aplicación no se vuelve difícil porque tiene muchas carpetas. Se vuelve difícil cuando cambiar una regla obliga a entender HTTP, una tabla, una cola y una pantalla a la vez. Arquitectura es decidir qué cosas pueden cambiar juntas y qué conversaciones deben pasar por un contrato. El criterio no es juntar nombres famosos: es reducir el radio de un cambio sin esconder las reglas que importan.

Venís de testing, servicios, seguridad y observabilidad. Ahora podés mirar un sistema completo y preguntar: ¿esta dependencia representa una necesidad del negocio o un detalle accidental? ¿quién posee este dato? ¿qué pasa si un mensaje se duplica o llega tarde? ¿vale pagar una frontera JS-Wasm? Al terminar vas a poder responder con un diseño concreto y con límites explícitos, no con un diagrama aspiracional.

## Cohesión, acoplamiento, DIP y módulos

La **cohesión** mide si las partes de un módulo cambian por la misma razón. Un módulo `orders` que valida una orden, calcula su total y nombra sus eventos puede ser cohesivo: todas son políticas de una orden. Un `utils` que mezcla `formatDate`, SQL y reglas de descuento es un depósito de coincidencias. La señal práctica no es la cantidad de líneas: es si una modificación razonable toca funciones que no comparten vocabulario.

El **acoplamiento** es cuánto necesita saber una parte sobre otra. No es malo por definición: una orden necesita conocer un precio. Se vuelve caro cuando conoce formato HTTP, nombres de columnas o clases internas que no son parte de su problema. Preferí depender de una interfaz pequeña y estable —un puerto— antes que de la implementación concreta:

```js
function decideOrderCreated(command) {
  return { id: command.eventId, type: 'order.created' };
}

export async function placeOrder(command, { publish }) {
  const event = decideOrderCreated(command);
  await publish(event);
  return event;
}

const event = await placeOrder({ eventId: 'evt-1' }, { publish: async () => {} });
console.log(event.type); // "order.created"
```

Eso es el **principio de inversión de dependencias** (DIP): las políticas de alto nivel y los detalles dependen de una abstracción definida por la necesidad de la política. No significa crear una interface por cada función ni usar un contenedor de DI. Si sólo hay una llamada local y ningún detalle variable, una importación directa es más clara. Aplicá DIP donde un detalle externo —base, transporte, reloj, proveedor— haría que probar, reemplazar o entender la política requiera arrastrar infraestructura.

Un módulo sano expone pocas operaciones con nombres del dominio y oculta formato, almacenamiento y auxiliares. JavaScript ya trae una herramienta fuerte para eso: ES modules. Exportá `placeOrder` o `decideOrderCreated`, no la estructura mutable donde guardás caches. Las rutas de importación también son contrato: si media aplicación importa `internal/sql.js`, ese archivo dejó de ser interno aunque el comentario diga lo contrario.

No confundas “bajo acoplamiento” con no compartir nada. Duplicar una regla fiscal para que cada servicio sea independiente crea dos verdades. Primero decidí el dueño de la regla; después exponé un contrato, una librería versionada o un proceso de coordinación según la frecuencia y el costo de cambiarla. La autonomía no es ignorar dependencias: es hacerlas visibles y baratas de evolucionar.

## Capas, hexágono y un core sin I/O

Las **capas** ordenan dependencias. Una entrada HTTP transforma request en comando; el caso de uso aplica política; un adaptador persiste o publica. La dirección valiosa es hacia adentro: el dominio no debería importar Express, `node:fs` ni el cliente de la cola. Una dependencia que apunta hacia afuera puede convertir un test de regla en un test de red.

La arquitectura **hexagonal** dice lo mismo desde las fronteras: los adaptadores de entrada traducen acciones externas a puertos de entrada; los adaptadores de salida implementan puertos que la aplicación necesita. HTTP y una tarea programada pueden invocar el mismo caso de uso. PostgreSQL y un fake en memoria pueden implementar el mismo puerto de repositorio. El hexágono no exige seis directorios, una clase `Port` ni simetría geométrica: exige que el negocio no dependa del cableado.

Una versión especialmente útil en JavaScript es **functional core, imperative shell**. El core recibe valores y devuelve valores; no lee reloj, red ni proceso. El shell hace I/O, construye entradas y ejecuta efectos. Mirá la separación:

```js
function decideOrderCreated(command) {
  return { id: command.eventId, type: 'order.created' };
}

const event = decideOrderCreated({ eventId: 'evt-2' }); // core: determinista
await Promise.resolve(); // shell: acá viviría publish(event), con retry y observabilidad
console.log(event.id); // "evt-2"
```

No llames “puro” a algo que consulta `Date.now()`, muta un singleton o lee `process.env`: sus dependencias están escondidas. Pasá un valor ya leído o una capacidad explícita cuando realmente haga falta. Tampoco fuerces pureza donde un streaming de archivos es central; ahí delimitá el efecto, fijá timeout, tamaño y manejo de error. El objetivo es que la decisión crítica sea fácil de ejecutar y explicar sin levantar infraestructura.

## DDD: contexto antes que entidad

DDD sirve cuando el problema tiene vocabulario, invariantes y equipos que no coinciden. Un **bounded context** es el borde donde una palabra y su modelo tienen significado consistente. `Customer` en facturación puede ser un sujeto de cobro; en soporte, una relación con casos; en logística, un destino. Forzarlos a compartir una tabla o una clase suele fabricar un modelo que nadie entiende.

El límite no es una licencia para crear microservicios. Puede vivir como dos módulos en el mismo proceso. Separalo cuando el vocabulario, la cadencia de cambio, las reglas de consistencia o la propiedad del dato divergen. Antes de separarlo por red, medí el costo: despliegues, observabilidad, fallas parciales y coordinación aumentan de golpe.

Entre contextos definí un **contrato**: nombre de evento o endpoint, versión, campos, semántica, autor, compatibilidad y política ante campos desconocidos. Un evento `order.created` no debe filtrar una fila SQL completa: comunica lo que el consumidor necesita, con IDs estables y unidades claras (`totalCents`, no `total`). Para evolucionarlo, agregá campos opcionales compatibles, versioná cuando cambie el significado y mantené una ventana real de convivencia. Consumir eventos con `eventId` y registrar los ya aplicados vuelve seguro el reintento; no hace atómica la red, pero evita duplicar su efecto.

## Eventos, CQRS y consistencia que se puede explicar

**Event-driven** describe que una parte publica un hecho y otras reaccionan sin invocación síncrona directa. Es útil para desacoplar reacciones, pero introduce orden, duplicación, demora y reintentos. Un broker no reemplaza contrato ni observabilidad. Guardá un identificador, definí qué orden importa por entidad, instrumentá lag y elegí qué pasa si el consumidor está caído.

**CQRS** separa modelo de escritura y modelo de lectura cuando sus necesidades son distintas. Por ejemplo, una orden se valida contra invariantes en escritura y se proyecta como una lista rápida para atención al cliente. No es “usar dos bases”: podés tener una misma base y dos modelos. Pagás con proyecciones atrasadas y más caminos de depuración; elegilo porque la lectura o el modelo lo justifican, no porque un diagrama lo vuelve moderno.

**Event sourcing** conserva eventos como fuente de verdad y reconstruye estado al reproducirlos. Da auditoría y permite nuevas proyecciones, pero exige versiones históricas, snapshots, privacidad, migración y operaciones de replay. Un log de auditoría no se convierte automáticamente en event sourcing: para serlo, el evento debe representar una transición de dominio suficiente para reconstruir el agregado.

En sistemas distribuidos la consistencia es una decisión de producto. “Orden aceptada” puede significar que el core validó y guardó su hecho, mientras inventario todavía muestra `pendiente`. Declaralo en el contrato y en la UI; no prometas “confirmado” antes de tener la evidencia necesaria. Diseñá efectos idempotentes, timeouts, retries acotados, dead-letter con diagnóstico y reconciliación. Una saga coordina pasos con compensaciones explícitas; no recupera mágicamente una acción externa irreversible.

```js
function applyOnce(state, event) {
  if (state.appliedEventIds.includes(event.id)) return state;
  return { ...state, appliedEventIds: [...state.appliedEventIds, event.id] };
}

const event = { id: 'evt-3' };
const next = applyOnce({ appliedEventIds: [] }, event);
console.log(applyOnce(next, event) === next); // true: reintentar no duplica el efecto
```

El laboratorio implementa este corte. La decisión genera un evento serializable y la proyección lo aplica sin mutar; la publicación, transacción y reintento pertenecen al shell. Es una pieza chica, pero hace observable la diferencia entre regla, contrato y efecto.

## WebAssembly 3.0: cuatro capas, no una promesa de velocidad

WebAssembly 3.0 finalizó el 17 de septiembre de 2025. No es “JavaScript más rápido”: es un formato de código y una máquina abstracta embebida por un host. Separá cuatro capas antes de adoptar una capacidad:

| Capa        | Define                                                                                    | No entrega por sí sola                         |
| ----------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Core**    | binario/texto, tipos, validación, instancias, memoria e instrucciones                     | DOM, red, archivos, scheduler                  |
| **JS API**  | `WebAssembly.compile`, `instantiate`, `validate`, `Module`, `Instance`, imports y exports | una interfaz web ni permisos de sistema        |
| **Web API** | integración web de `Response` para `compileStreaming` e `instantiateStreaming`            | DOM, Workers, permisos o una ABI de filesystem |
| **WASI**    | interfaces de sistema portables y capability-based que un runtime puede conceder          | disponibilidad universal en browser o Node     |

Core determina si unos bytes son un módulo válido; la **JS API** lo compila e instancia. Compilar decodifica y valida; instanciar resuelve imports, asigna recursos y puede ejecutar la función `start`. Ahí está el límite: una importación de JS a Wasm es una llamada host, y una exportación Wasm a JS debe convertir valores según su interfaz. Medí esa frontera; muchas llamadas pequeñas, copias de strings y marshaling de objetos pueden costar más que el cálculo.

En web, `instantiateStreaming(fetch(url), imports)` puede evitar esperar todo el cuerpo si respuesta y servidor son adecuados, pero sigue dependiendo de `fetch`, MIME, CSP, red y el navegador. En otro runtime quizás cargues bytes de otra forma. WASI tampoco es “Node dentro de Wasm”: sus capacidades las decide el host —por ejemplo directorios preabiertos— y sus previews/versiones son contratos que el runtime debe implementar.

Detectá la capacidad exacta, no sólo una marca global:

```js
const moduleBytes = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]); // módulo vacío válido
const hasWasmApi = typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
const acceptsThisModule = hasWasmApi && WebAssembly.validate(moduleBytes);
console.log(hasWasmApi, acceptsThisModule); // true true en un runtime con la API básica
```

`hasWasmApi` sólo confirma la API básica. `validate` confirma que esos bytes son válidos para ese runtime; no confirma que tu host entregue los imports, ni una feature opcional, ni que WASI exista. Para una feature concreta usá bytes de prueba o una carga controlada en los targets declarados, manejá `CompileError`/`LinkError`, y conservá una ruta JS cuando el producto la necesita. No ejecutes el probe como efecto de inicio si el módulo tiene imports sensibles o carga costosa.

Usá Wasm cuando un cálculo pesado, estable y con datos que permanecen del mismo lado muestra una mejora medida: codecs, parseo binario, simulación o librerías portadas pueden ser buenos casos. No lo uses para manipular DOM, orquestar I/O, reemplazar una función JS corta, cruzar objetos ricos en cada iteración o “por seguridad” sin revisar imports, memoria y permisos. Wasm aísla su memoria lineal, pero el host y las capacidades importadas siguen siendo parte del límite de confianza.

## Laboratorio, recuperación y sesión V2

Abrí `starter.mjs`. `decideOrderCreated` es el core: acepta un comando con IDs e ítems, valida cantidades/precios enteros seguros y devuelve `order.created` v1 con `totalCents`. No genera IDs ni publica. `applyOrderCreated` es una proyección: recibe `{ orders, appliedEventIds }`, no muta el estado y al ver el mismo `eventId` devuelve la misma referencia. Un `orderId` repetido con un evento no deduplicado es conflicto, no una excusa para sobrescribir.

Pista 1: validá el comando antes de calcular; “multiplicar” no vuelve válido un precio. Pista 2: verificá cada línea y el acumulado con `Number.isSafeInteger`. Pista 3: reutilizá la decisión para validar el evento de la proyección, pero no llames a un broker desde ninguna de las dos funciones. Está listo cuando `node solution.mjs` cubre orden válida, input inválido, overflow, estado congelado, idempotencia, versión/tipo no soportado y conflicto.

Respondé sin mirar: ¿qué cambio une cohesión? ¿cuándo DIP evita depender de un detalle? ¿qué diferencia un bounded context de un microservicio? ¿qué no resuelven CQRS y event sourcing? ¿qué capa de Wasm promete un filesystem? Transferí el ejercicio a inventario: definí qué evento publica órdenes, qué proyección puede atrasarse, qué ID la hace idempotente y qué mensaje ve el usuario mientras espera.

En Learn Anything V2 iniciá `study`, resolvé primero el diagnóstico socrático y explicá la frontera que elegirías. El feedback y la corrección se guardan bajo revisión; sólo práctica, quiz o transferencia efectivamente observados producen evidencia para mastery, spacing e interleaving. No inventes una sesión ni declares dominio por leer. A las 48 horas, recibí un evento `order.created` duplicado y otro con versión nueva: escribí la política de compatibilidad, la traza de la proyección y el rollback antes de consultar apuntes.

## Referencias primarias

- [WebAssembly Core Specification 3.0](https://webassembly.github.io/spec/core/)
- [WebAssembly JavaScript API](https://webassembly.github.io/spec/js-api/)
- [WebAssembly Web API](https://webassembly.github.io/spec/web-api/)
- [WebAssembly 3.0 release](https://github.com/WebAssembly/spec/releases)
- [WASI: objetivos y diseño por capacidades](https://github.com/WebAssembly/WASI/blob/main/docs/HighLevelGoals.md)
- [WASI filesystem preopens](https://github.com/WebAssembly/wasi-filesystem/blob/main/wit/preopens.wit)
- [ECMAScript modules](https://tc39.es/ecma262/2026/multipage/ecmascript-language-scripts-and-modules.html)
