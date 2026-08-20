# 11.1 — Testing, verificación y entrega confiable

## La evidencia tiene que tocar el riesgo

Un test que pasa no prueba que el sistema esté listo: prueba exactamente lo que su assert observó bajo esas condiciones. Si una transferencia calcula mal el saldo, una unidad sobre la regla es evidencia fuerte. Si dos servicios ya no entienden el mismo JSON, la unidad puede seguir verde: necesitás observar el contrato. Si el usuario no puede completar una compra, una colección de mocks no sustituye un recorrido real. La pregunta útil no es “¿tenemos tests?”, sino “¿qué riesgo queda cubierto por cuál evidencia?”.

Este capítulo conecta el código de 10.x con una entrega que se puede revisar y recuperar. Vas a distinguir niveles de prueba, elegir dobles sin simular tu propio sistema, volver reproducibles reloj, azar e interleavings, y leer coverage como señal de exploración, nunca como certificado de calidad. Requiere toolchain y Node; los ejemplos de `node:test` dependen del runtime, así que detectá la versión y corré `node --test` en el entorno que entrega.

## Unit, integración, contrato y end-to-end

Una **unit test** aísla una decisión pequeña con dependencias controladas. Da feedback rápido y ubica el error cerca de su causa. Una regla de comisión debería tener casos de borde explícitos:

```js
import assert from 'node:assert/strict';
assert.equal(fee(1000, 'standard'), 25);
assert.throws(() => fee(-1, 'standard'), RangeError);
```

Eso prueba fórmula y frontera, no que el adaptador SQL haga la transacción correcta. La **integración** une piezas reales: repositorio con una base efímera, parser con filesystem temporal, handler con serializador. Su riesgo es que dos componentes localmente correctos fallen al conectarse: encoding, transacción, permisos, orden o timeout.

Una prueba de **contrato** fija lo que una frontera promete a otro proceso o equipo. No es sólo un schema: incluye nombres, tipos, ausencia versus `null`, códigos de error, paginación e idempotencia. Si el consumidor necesita `error.code === 'INSUFFICIENT_FUNDS'`, guardá ese ejemplo acordado y hacelo correr contra el proveedor. Un test de contrato no reemplaza integración: busca incompatibilidad antes de desplegar los dos lados.

**End-to-end** recorre el camino que importa para una persona o sistema externo: autenticar, crear pedido, pagar, ver confirmación. Tiene menos diagnósticos y más costo, por eso elegí pocos flujos críticos. Una pirámide no es una cuota religiosa: para una regla compleja puede haber muchas unidades; para un protocolo riesgoso, más integración y contrato. La mezcla sale del riesgo.

| Riesgo                                    | Evidencia que lo ataca                    | Evidencia insuficiente por sí sola   |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------ |
| Descuento negativo o redondeo             | Unit con bordes y propiedades             | Pantalla e2e feliz                   |
| SQL, encoding o transacción incompatibles | Integración con adaptador real            | Mock que devuelve el objeto esperado |
| Cambio incompatible de API                | Contrato proveedor-consumidor             | Coverage del handler                 |
| Flujo crítico roto entre capas            | E2E acotado                               | Unit verde de cada módulo            |
| Carrera, duplicado o timeout              | Test con interleaving controlado y trazas | Reintentar hasta que pase            |

Nombrá el riesgo junto al test. “debería funcionar” no permite decidir qué evidencia falta cuando una release cambia.

## Dobles: reemplazar una frontera, no inventar una realidad

Una **fixture** es dato conocido: un pedido mínimo, una respuesta HTTP archivada o una migración con filas adversarias. Hacela pequeña, legible y estable; una fixture gigantesca es producción camuflada y nadie sabe qué condición importa.

Un **stub** devuelve una respuesta fijada. Un **mock** además verifica una interacción, por ejemplo que `send` reciba una clave idempotente. Un **fake** implementa una alternativa funcional reducida, como un repositorio en memoria con la misma semántica de búsqueda. Elegí el doble por la observación: no asertees “se llamó tres veces” si el contrato sólo necesita que se haya persistido el resultado.

El **test seam** es una costura explícita donde inyectás una dependencia: reloj, generador de IDs, transporte o repositorio. Es mejor pasar `now` que parchear `Date.now` globalmente:

```js
function expiresAt(now, ttlMs) {
  return now() + ttlMs;
}
assert.equal(
  expiresAt(() => 1_700_000_000_000, 5000),
  1_700_000_005_000,
);
```

La costura conserva el comportamiento productivo si el caller pasa `Date.now`; el test usa un fake determinista. No agregues interfaces vacías para cada import. Extraé una frontera cuando ya hay efecto externo, azar, tiempo o costo de inicialización. El doble tampoco autoriza una mentira: una integración periódica con el sistema real detecta que tu fake dejó de reflejar el contrato.

## Más casos no siempre son más ideas

Los ejemplos dirigidos enseñan escenarios nombrados. Las pruebas basadas en **propiedades** generan muchos inputs y verifican invariantes: serializar y deserializar conserva un valor válido; ordenar nunca pierde elementos y deja cada par en orden. Guardá la semilla y el caso reducido cuando falle; si no podés reproducirlo, todavía no tenés un bug investigable.

**Mutation testing** cambia deliberadamente `>` por `>=`, borra una rama o altera un literal. Si los tests continúan verdes, el mutante sobrevivió: tus asserts no distinguieron esa decisión. No midas mutants sobrevivientes para alcanzar un número; usalos sobre lógica de alto impacto para encontrar una afirmación faltante.

**Fuzzing** alimenta bytes, strings y estructuras raras a parsers, decodificadores o límites de confianza. Busca crashes, cuelgues, consumo excesivo y validaciones inconsistentes. Poné límite de tiempo y tamaño, registrá input/seed y reducí el caso. Una fuzzer que sólo genera texto ASCII prolijo no explora la frontera que te preocupa.

La concurrencia agrega órdenes posibles. Una prueba con `await` arbitrarios suele ser frágil porque depende del scheduler real. Diseñá una barrera, un fake de transporte o una cola controlada; aserteá el invariante: “un ID idempotente produce un solo cargo”, “el contador no excede el límite”, “el resultado conserva el orden”. El laboratorio limita trabajo en vuelo y conserva el orden de entrada aun cuando cada worker termine en distinto momento.

## Determinismo y Node test runner

`node:test` y `node:assert/strict` alcanzan para muchas suites Node sin sumar un framework. Un archivo `*.test.mjs` puede declarar pruebas y correr con:

```bash
node --test test/payment.test.mjs
node --test --test-concurrency=1 test
```

El runner termina con código no cero si falla. `--test-concurrency=1` sirve para diagnosticar contaminación o una carrera, no para declarar que el código concurrente es correcto. Para timers, la API de mocks del contexto puede avanzar tiempo sin dormir; verificá primero que tu versión la soporte, porque las APIs del runner evolucionan. No hagas feature detection para esconder una prueba: si la capacidad requerida no existe en CI, el pipeline debe decirlo claramente o usar una costura portable.

Controlá tiempo, azar, red, procesos y estado global. Restaurá lo que parchees en `afterEach`; mejor todavía, no lo parches. No dependas del orden de archivos, del huso horario local, de una cuenta externa compartida ni de puertos elegidos al azar sin registrarlos. La prueba determinista da el mismo veredicto para el mismo commit e input. Si falla sólo a veces, conservá la traza y convertí el interleaving en un caso controlado antes de llamar “flake” al síntoma.

## Coverage es un mapa, no una garantía

Coverage contesta “¿qué líneas, funciones o ramas se ejecutaron?”. No contesta si el assert era útil, si se verificó el resultado correcto, si el contrato era el acordado ni si el usuario podía terminar el flujo. Podés ejecutar una rama y no comprobar nada; podés tener 100% de líneas y ningún caso para una autorización negada.

Usalo como mapa para encontrar código no explorado y como alarma cuando una zona crítica queda oscura. Leé branch coverage para decisiones reales, inspeccioná los tests y priorizá los invariantes. No bloquees una entrega sana porque una línea defensiva imposible de alcanzar baja el porcentaje; documentá por qué. Tampoco subas cobertura llamando funciones sin asserts. La señal fuerte es una relación visible entre riesgo, entrada, salida y oráculo.

## CI, revisión, versionado y migraciones

CI es el lugar donde repetís evidencia desde cero: checkout limpio, dependencias bloqueadas, lint, typecheck, unidades, integración/contratos y los e2e seleccionados. Separá jobs lentos de feedback rápido, pero no cambies el conjunto de pruebas según quién abrió la rama. Publicá artefactos útiles: reporte de contrato, screenshot e2e o seed que reproduce un fuzz, no credenciales ni bases completas.

La revisión humana busca lo que el test no supo preguntar: frontera de confianza, nombre engañoso, rollback, compatibilidad, observabilidad y cambio accidental. Un diff pequeño con una pregunta precisa es más revisable que una release que mezcla refactor, feature y migración. Versioná contratos públicos y deprecá antes de quitar cuando consumidores puedan convivir. Semver comunica intención, no ejecuta compatibilidad: el contrato ejecutable es la evidencia.

Una migración segura empieza antes del SQL. Hacé backup restaurable, medí el estado previo y probá forward y recuperación en una copia representativa. Preferí expandir primero —columna nullable, lector compatible con ambos formatos—, desplegar lectores, backfillear con métricas, y contraer después de verificar. Si no hay rollback seguro por pérdida de información, escribí un plan de recuperación y detené el rollout ante la señal acordada. “Tenemos `DOWN`” no prueba que pueda recuperar datos ni que versiones viejas sigan funcionando.

| Riesgo de entrega              | Evidencia previa                         | Señal de freno o recuperación   |
| ------------------------------ | ---------------------------------------- | ------------------------------- |
| Pipeline distinto de la laptop | CI desde checkout limpio                 | Job requerido fallido           |
| API incompatible               | Contrato de consumidor y versión         | Consumidor no valida payload    |
| Migración destructiva          | Restore, forward y recuperación probados | Métrica/backfill fuera de rango |
| Error no visto en revisión     | Diff focalizado y checklist de frontera  | Cambio no explicado o sin dueño |

## Laboratorio: evidencia para una release y una cola limitada

En `starter.mjs`, `releaseDecision` recibe evidencia booleana de unit, integración, contrato, e2e y revisión, más una migración con `backup`, `forward`, `rollback` y `recovery`. Devuelve `{ ready, blockers, coverage }`. La migración queda lista con backup y forward, y con rollback **o** recuperación probada. `coverage` debe estar entre 0 y 100, pero **no** puede convertir una entrega incompleta en lista: sólo informa alcance. Un campo faltante o de tipo incorrecto es error de frontera; sólo evidencia explícitamente negativa aparece en `blockers`.

`runBatch(items, worker, { concurrency })` recibe un worker async. Debe rechazar entradas inválidas, nunca superar el límite y devolver resultados en orden de entrada aunque las promesas terminen distinto. El worker inyectado es el seam; en un test real podés usar un fake que registra cuántas operaciones quedan activas. `node starter.mjs` comienza RED y `node solution.mjs` termina GREEN.

Pista 1: construí `blockers` desde una lista de requisitos, sin tratar coverage como requisito. Pista 2: reservá un índice antes de `await`. Pista 3: iniciá como máximo `Math.min(concurrency, items.length)` consumidores y escribí cada resultado en su índice.

Está terminado cuando los asserts prueban una release completa, un contrato negativo pese a 100% coverage, rollback o recuperación alternativos, ambos ausentes como bloqueo, un campo faltante como TypeError, orden preservado y pico de dos workers. Después, trasladá esa evidencia a un `*.test.mjs` y corrélo con `node --test`; el archivo autocontenido es una referencia ejecutable, no una suite productiva.

Recuperación: ¿qué riesgo prueba una contract test? ¿cuándo elegirías fake antes que mock? ¿qué diferencia property-based de fuzzing? ¿por qué un mutante superviviente importa? ¿qué informa coverage y qué no? Transferí el modelo a una API de pagos: definí una property de idempotencia y el contrato de error. Luego diseñá una migración de email a tabla separada con expansión, backfill, monitoreo y recuperación.

En V2, respondé el diagnóstico socrático nombrando primero el riesgo, luego la evidencia mínima y recién después la herramienta. El feedback puede corregir “100% coverage” por una afirmación observable o mostrar que un mock verifica implementación en vez de contrato. Sólo un diagnóstico, práctica, corrección y evaluación efectivamente realizados producen evidencia para mastery; no la declares por haber leído el capítulo. En 48 horas, sin apuntes, recibí una release con test verde y explicá qué evidencia pedirías para un cambio de API, una carrera y una migración irreversible.

## Referencias primarias

- [Node.js: test runner](https://nodejs.org/api/test.html)
- [Node.js: command-line options `--test`](https://nodejs.org/api/cli.html#--test)
- [Node.js: `node:assert/strict`](https://nodejs.org/api/assert.html#strict-assertion-mode)
- [Martin Fowler: practical test pyramid](https://martinfowler.com/articles/practical-test-pyramid.html)
- [Google SRE Book: canarying releases](https://sre.google/sre-book/canarying-releases/)
