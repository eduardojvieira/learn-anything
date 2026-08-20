# 11.2 — Seguridad, performance y observabilidad

## El pedido que no es un dato

Una request llega con JSON, headers, cookies, parámetros y un contexto de red. Nada de eso es “un objeto de JavaScript que ya podés usar”: es una afirmación hecha fuera de tu proceso. La regla que ordena este capítulo es simple: **validá en la frontera, elegí una API que no interprete datos como código y medí antes de optimizar**. Seguridad, performance y observabilidad no son tres anexos; las tres responden qué entra, cuánto cuesta y qué evidencia queda cuando algo sale mal.

Requiere testing, red y concurrencia básica. Al terminar vas a poder trazar un dato desde su entrada hasta un log sin abrir una superficie innecesaria, distinguir un problema de complejidad de una micro-optimización de motor, y diseñar una señal que alguien pueda usar a las tres de la mañana.

## Modelo de amenazas y fronteras de confianza

Un modelo de amenazas no empieza por una lista de siglas. Empezá por el activo: una sesión, dinero, datos de perfil, capacidad de enviar correo. Después nombrá quién puede influirlo y por qué canal. Un browser controlado por un usuario, una cola externa, una variable de entorno, una respuesta de otro servicio y un archivo importado son fronteras de confianza. El código propio y los datos que ya validaste pueden tener otro contrato, pero tampoco son mágicamente correctos.

Para cada flujo preguntá: ¿quién controla este valor?, ¿qué operación peligrosa podría alcanzar?, ¿qué autorización hace falta?, ¿qué dato no debe salir en un log? Por ejemplo, “actualizar perfil” tiene un body no confiable, una cookie de sesión enviada automáticamente por el browser, y una base que no debe aceptar campos administrativos. La solución no es una función `sanitizeEverything`: es un esquema pequeño por frontera y una autorización cerca de la operación.

Un payload como `{"name":"Noa","admin":true}` no se copia con `Object.assign(account, profile)`: tras validar, construí la representación interna mínima, por ejemplo `{ name: profile.name }`. Eso no autoriza el cambio ni valida todavía el texto; muestra el principio de reconstruir una representación interna. Un allowlist tiene una ventaja práctica sobre una blacklist: conoce el contrato que querés soportar. Rechazá claves inesperadas, validá tipo, formato, tamaño y rango antes de convertir, guardar o enviar el valor a otro intérprete. Mantené los permisos en servidor: ocultar un botón no es autorización.

## Inyección: que el dato siga siendo dato

XSS aparece cuando datos no confiables llegan a un _sink_ HTML, JavaScript, URL o CSS con una codificación equivocada. Si querés mostrar texto, preferí la API que expresa texto:

```js
const title = '<img src=x onerror=alert(1)>';
element.textContent = title;
console.log(element.textContent === title); // true; no se interpreta como HTML
```

`textContent` no es un sanitizer de HTML: evita necesitar HTML. Si el producto realmente permite HTML, definí un formato reducido y usá un sanitizer mantenido para ese contexto; no inventes uno con regex. `innerHTML`, event handlers como string y `eval` convierten datos en una superficie de ejecución y no son atajos aceptables. Una Content Security Policy bien desplegada reduce impacto, pero no reemplaza codificación contextual ni revisión de los sinks.

La misma separación vale para SQL, comandos y consultas de un buscador. Una consulta parametrizada pasa el valor por un canal de datos, no dentro de la gramática SQL:

```js
const query = 'SELECT id, name FROM users WHERE email = $1';
const values = [email];
await db.query(query, values);
```

No interpolés `email` ni “escapes a mano”. Para partes estructurales —columna, dirección de orden, nombre de tabla— un parámetro común no sirve: elegí desde una lista fija del servidor. Validar JSON no elimina injection; sólo convierte bytes en valores JavaScript. Cada intérprete que uses después necesita su propia frontera.

## CSRF, prototipos y deserialización

CSRF explota que el browser adjunta cookies de sesión a requests iniciadas desde otro sitio. Para operaciones que cambian estado, verificá origen cuando aplique, usá tokens CSRF o un mecanismo equivalente ligado a sesión, y configurá cookies con `Secure`, `HttpOnly` y `SameSite` según el flujo. `SameSite` es defensa complementaria: no reemplaza autorización, ni arregla CORS, ni justifica aceptar cualquier origen. CORS controla qué respuesta puede leer otro origen; no es una defensa CSRF por sí solo.

Prototype pollution ocurre cuando claves controladas como `__proto__`, `constructor` o `prototype` llegan a operaciones de copia/merge o a una ruta de propiedades que altera un prototipo. El riesgo depende de la operación y del destino, por eso la política útil no es “borrar tres strings al final”: usá esquemas cerrados, construí objetos nuevos sólo con campos permitidos y evitá merges profundos genéricos sobre datos no confiables.

```js
const input = JSON.parse('{"__proto__":{"isAdmin":true},"name":"Noa"}');
console.log(Object.keys(input)); // [ '__proto__', 'name' ]
// parseProfile rechaza la clave antes de que alcance configuración interna.
```

Deserializar no autentica ni valida. `JSON.parse` no ejecuta código, pero puede entregar formas inesperadas, campos extra, texto enorme o números fuera del dominio. Evitá deserializadores que reviven clases o ejecutan hooks con input no confiable. Si recibís un formato binario, definí versión, límites de tamaño y esquema antes de asignarlo a objetos de negocio. Para JSON, `JSON.parse` con una validación explícita suele ser la opción mínima y clara.

## Performance: encontrar el costo real

“Más rápido” necesita un workload, una métrica y un baseline. Antes de cambiar un loop, reproducí la operación lenta con entradas representativas: tamaño normal y extremo, distribución realista, warm-up suficiente y el mismo runtime. Medí más de una vez; una corrida sola incluye scheduling, GC, cache y ruido de máquina. En Node, el profiler de CPU y el inspector responden dónde pasa tiempo; las herramientas de heap responden qué retiene memoria. Un benchmark pequeño sirve para comparar una hipótesis, no para declarar una verdad universal.

```js
import { performance } from 'node:perf_hooks';
const started = performance.now();
const total = Array.from({ length: 100_000 }, (_, i) => i).reduce((a, b) => a + b, 0);
console.log({ total, elapsedMs: performance.now() - started });
```

La salida varía; su utilidad es comparar el mismo caso antes y después, no prometer milisegundos. Medí también allocation pressure: crear arrays, closures u objetos por cada elemento puede aumentar GC aunque el algoritmo sea O(n). Los acumuladores también tienen un dominio: que cada duración sea finita no garantiza que su suma lo sea. Si una métrica no puede representar el total, rechazá o rediseñá el contrato de forma explícita; no publiques `Infinity` como una latencia real. A menudo la mejora grande viene de evitar trabajo repetido, elegir una estructura correcta o reducir viajes de red, no de reemplazar `for...of` por otro loop.

La complejidad te da una alarma antes de perfilar. Buscar cada id con `array.find` dentro de otro recorrido puede ser O(n²); preindexar una vez con `const byId = new Map(users.map((user) => [user.id, user]))` suele llevarlo cerca de O(n + m), y `requestedIds.map((id) => byId.get(id)?.name ?? null)` hace una búsqueda esperada por id. Pero no cambies por reflejo: un `Map` tiene memoria y construcción inicial. El tamaño, la frecuencia y el perfil deciden.

## JIT: dato de diagnóstico, no contrato

Los motores modernos pueden compilar caminos calientes, usar _shapes_ (la disposición de propiedades), inline caches y deoptimizar cuando una suposición deja de valer. Es información para interpretar un perfil, no una especificación de ECMAScript. V8, JavaScriptCore y SpiderMonkey cambian estrategias; una versión nueva puede invalidar un truco.

Un código con objetos de forma coherente y tipos previsibles puede ayudar a un motor, pero no sacrifiques el contrato por “monomorfismo”. No fuerces propiedades ficticias, no dependas de flags internos y no concluyas que un cambio sirve sin benchmark representativo. Si el profiler muestra deopt o megamorfismo, simplificá la representación y volvé a medir. Si no hay evidencia, preferí claridad y la complejidad correcta.

## Logs, métricas, trazas y alertas

Un log estructurado cuenta un hecho discreto: `requestId`, operación, resultado, duración, código de error estable. No copies el body, cookie, token, contraseña ni PII por comodidad. Una métrica agrega: contador de requests, tasa de errores, histograma de latencia, tamaño de cola. Sirve para responder “¿cuánto y desde cuándo?”. Una traza conecta spans de una operación entre procesos y responde “¿dónde estuvo el tiempo?”. Propagá un identificador de correlación, pero tratá ese identificador como dato permitido y acotado, no como un lugar para poner secretos.

```js
const event = {
  requestId: 'r-42',
  operation: 'profile.update',
  outcome: 'rejected',
  durationMs: 7,
};
console.log(JSON.stringify(event));
// {"requestId":"r-42","operation":"profile.update","outcome":"rejected","durationMs":7}
```

Diseñá alertas para una acción concreta. “Un error ocurrió” pagina por ruido. Mejor: tasa de errores sobre un umbral durante una ventana, combinada con volumen mínimo y un runbook que diga cómo mirar dashboard, trazas y rollback. Probá el camino de alerta y revisá cardinalidad: poner `userId` o URL completa como etiqueta de métrica puede volver cara o inútil la serie. El detalle va en logs o trazas; las métricas conservan dimensiones acotadas.

La compatibilidad también entra en esta decisión. `performance.now()` y el inspector son capacidades del runtime, no parte de ECMA-262: antes de instrumentar una librería compartida verificá qué expone el host o aislá esa medición en el adaptador Node. Del mismo modo, la exportación concreta de logs y trazas depende del proveedor. Conservá un evento interno pequeño y explícito, y probá el transporte en los targets declarados; no supongas que una integración disponible en tu máquina existe en todos los procesos.

## Laboratorio: frontera y señal mínima

Abrí `starter.mjs`. `parseProfile` acepta sólo `{ name, theme? }`, rechaza claves extra —incluida una `__proto__` obtenida de JSON— y construye un objeto nuevo. `requestMetrics` recibe muestras ya permitidas y devuelve sólo conteos y tiempos agregados: no registra payloads ni errores crudos. Ambos contratos hacen visible una decisión: los datos se validan antes de usarlos y la telemetría conserva lo necesario para operar, no todo lo que pasó por memoria.

Pista 1: `Object.keys` ve la clave propia `__proto__` de JSON. Pista 2: una allowlist de dos claves es más simple que copiar y luego intentar limpiar. Pista 3: validá cada muestra antes de sumarla; `NaN` no es una duración y dos valores finitos pueden desbordar al acumularse. Está listo cuando `node solution.mjs` cubre perfil válido, campo extra, payload de prototype pollution, input congelado, lote vacío, error de request, duraciones inválidas y overflow.

Recuperación: ¿cuál es la frontera de confianza de un body HTTP? ¿por qué `textContent` es preferible si necesitás texto? ¿qué diferencia CORS de CSRF? ¿qué mide un profiler frente a un benchmark? ¿cuándo un label de métrica tiene demasiada cardinalidad? Para transferencia, diseñá el esquema de una importación CSV y una alerta para pagos rechazados: definí campos permitidos, límites, métrica, ventana y acción.

En Learn Anything V2, empezá `study`, respondé el diagnóstico socrático y guardá tu razonamiento sobre un flujo real. El feedback y su corrección quedan bajo revisión; sólo práctica o evaluación efectivamente observada crean evidencia y mastery derivado. En 48 horas, sin apuntes, analizá un endpoint de cambio de email: marcá fronteras, autorización, CSRF, datos que no loguearías, métrica de fracaso y una traza que usarías para investigar una degradación.

## Referencias primarias

- [OWASP: Input Validation](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html)
- [OWASP: Cross Site Scripting Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [OWASP: Cross-Site Request Forgery Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP: Prototype Pollution Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Prototype_Pollution_Prevention_Cheat_Sheet.html)
- [Node.js: profiling y diagnóstico](https://nodejs.org/en/learn/getting-started/profiling)
- [OpenTelemetry: especificación](https://opentelemetry.io/docs/specs/otel/)
