# 10.1 — Runtime Node.js, procesos e I/O

## Node no es el navegador con acceso a disco

Node ejecuta JavaScript sobre V8, pero el programa vive dentro de un proceso del sistema operativo. Eso agrega un contrato que una página no suele tener: recibe argumentos y variables de entorno, abre archivos y sockets, mantiene recursos activos, puede recibir señales y debe terminar con un código que otra herramienta interpreta. La pregunta útil no es “¿cómo leo un archivo?”, sino “¿qué conserva vivo este proceso, qué entrada confío y cómo sale sin perder trabajo?”.

Un proceso de Node avanza mientras haya trabajo pendiente en el event loop: timers, I/O, servidores, streams o handles abiertos. Cuando no queda ninguno, puede salir naturalmente. `process.exit()` corta de inmediato; no lo uses como atajo después de iniciar escrituras asíncronas, porque puede truncar `stdout`, `stderr` o un archivo. Preferí fijar `process.exitCode` y dejar que el loop se vacíe. El evento `beforeExit` no corre al terminar por una señal, excepción no capturada o `process.exit()` y no es un lugar para “salvar” una aplicación; programar trabajo nuevo ahí puede mantenerla viva para siempre. `exit` sólo admite trabajo síncrono.

```js
process.exitCode = 1;
console.error('faltó --input');
// Node termina cuando ya no haya handles pendientes.
```

## CLI, entorno y fronteras de entrada

`process.argv` contiene la ruta del ejecutable, la del script y luego los argumentos. No adivines posiciones si la CLI crece: consumí flags explícitos y rechazá lo ambiguo. En `process.env` todo llega como string (o falta como `undefined`), incluso `PORT=3000` y `DEBUG=false`. Convertí y validá una vez, cerca de la frontera.

```js
const args = process.argv.slice(2);
const rawPort = process.env.PORT ?? '3000';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new RangeError('PORT debe estar entre 1 y 65535');
}
```

Una variable de entorno no es un secreto por ser “configuración”: puede aparecer en diagnósticos, procesos hijos y herramientas de CI. Nunca imprimas el objeto entero `process.env`; elegí claves públicas. Tampoco montes comandos con argumentos sin validar. Si necesitás un proceso hijo, pasá programa y argumentos separados a `spawn` o `execFile`; `exec` agrega un shell y por eso cambia la superficie de inyección y quoting.

El código de salida es parte de la API de una CLI: `0` comunica éxito, un valor distinto comunica falla al shell. Una excepción no controlada normalmente termina el proceso con falla; para un error de uso esperado, imprimí una explicación corta en `stderr`, fijá `exitCode` y no continúes con un estado inválido.

## Archivos, paths, URLs y bytes

Los módulos `node:fs/promises` y `node:path` trabajan con rutas; `node:url` traduce `file:` URLs. No construyas paths con `'/':` `path.join(base, nombre)` respeta el separador del host. Si recibís una ruta externa, resolvela contra una base y verificá que no escape antes de leer o escribir; normalizar por sí solo no autoriza nada.

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const text = await readFile(path.join(here, 'datos.txt'), 'utf8');
```

Una `URL` y un string de path no son intercambiables. `new URL('./datos.txt', import.meta.url)` es excelente para recursos relativos a un módulo y muchas APIs de `fs` aceptan esa URL; `url.pathname` no es una conversión portable porque conserva escapes y reglas URL. Usá `fileURLToPath()` cuando una API exige path. Para convertir un path conocido en URL, usá `pathToFileURL()`.

Un archivo es bytes. `readFile(ruta)` retorna `Buffer`; `readFile(ruta, 'utf8')` decodifica texto. `Buffer` es una vista binaria y puede compartir memoria con otras vistas: no supongas que modificar una vista es una copia. Para protocolos usá bytes explícitos y codificación explícita (`Buffer.from(text, 'utf8')`); no cortes UTF-8 por byte y esperes caracteres válidos. Un stream de texto con `setEncoding('utf8')` o un `TextDecoder` preserva secuencias partidas entre chunks.

## Eventos y streams: notificación no es flujo controlado

`EventEmitter` es una base para notificaciones locales. `emit()` llama listeners de forma síncrona y en orden: un listener lento bloquea al emisor. Registrá listeners antes de disparar si necesitás ver un evento, eliminá los temporales y no uses eventos como un bus global sin dueño. El evento especial `'error'` requiere al menos un listener: emitirlo sin uno puede hacer fallar el proceso.

```js
import { EventEmitter } from 'node:events';

const progreso = new EventEmitter();
progreso.on('line', (line) => console.log(line));
progreso.emit('line', 'primera'); // el listener corre ahora, no “más tarde”.
```

Los streams modelan flujo con presión de retorno (**backpressure**). Un `Readable` produce, un `Writable` consume, un `Duplex` hace ambos y un `Transform` convierte. No conectes streams sólo con `.pipe()` y olvides errores: `pipeline()` de `node:stream/promises` espera finalización, propaga errores y destruye el resto de la cadena. Para consumo incremental, `for await (const chunk of readable)` maneja la pausa del `Readable`; cada `chunk` puede ser `Buffer` y una línea puede quedar partida entre chunks.

```js
import { pipeline } from 'node:stream/promises';
import { createReadStream, createWriteStream } from 'node:fs';

await pipeline(createReadStream('entrada.txt'), createWriteStream('salida.txt'));
```

No acumules un stream entero en un array “por comodidad” si su tamaño no tiene cota; así anulás streaming y podés agotar memoria. Elegí límites de tamaño, procesá por chunk o línea y dejá que el `Writable` marque el ritmo.

## Señales, errores fatales y apagado ordenado

`SIGINT` suele venir de Ctrl-C y `SIGTERM` de un supervisor o contenedor. Un handler instalado reemplaza el comportamiento por defecto, por lo que ahora vos tenés la responsabilidad de terminar. El patrón es: dejar de aceptar trabajo nuevo, dar una ventana acotada al trabajo activo, cerrar recursos y salir. Hacé el handler idempotente: dos señales no deben intentar cerrar el mismo recurso dos veces. Un timeout de seguridad debe terminar con un código de falla si el apagado se traba.

```js
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  server.close(); // deja de aceptar conexiones
  await closeDatabase();
  process.exitCode = 0;
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
```

En un servicio real, agregá timeout, cerrá primero el listener y esperá solicitudes activas sólo hasta el límite acordado. No hagas I/O asíncrono en `exit`; no llames `process.exit(0)` desde una señal antes de que cierren los recursos. Probá el camino enviando la señal en un proceso de prueba, no sólo llamando la función a mano.

`uncaughtException` significa que el estado de la aplicación ya no es confiable. `unhandledRejection` también debe tratarse como un defecto que corregir en el origen, no como un mecanismo de control de flujo. No enseñes ni uses `process.on('uncaughtException', () => {})` para registrar y seguir atendiendo: puede dejar invariantes, transacciones o recursos en un estado parcialmente roto. Para observación sin cambiar el fin normal, `uncaughtExceptionMonitor` permite registrar de modo mínimo; el supervisor debe reiniciar un proceso que falló. Los errores esperados se manejan antes, en la frontera que conoce su recuperación.

## Inspector, diagnósticos y permisos

El inspector permite depurar con `node --inspect app.mjs` (por defecto escucha en 127.0.0.1:9229). `--inspect-brk` pausa antes de ejecutar código de usuario. No lo expongas a una interfaz de red pública: quien puede usar el inspector puede ejecutar código en el proceso. Para investigar una caída, Node también puede producir reportes diagnósticos, por ejemplo con `--report-uncaught-exception`, `--report-on-fatalerror` o `--report-on-signal`; revisalos como material sensible porque incluyen estado del proceso y rutas.

El Permission Model de Node es estable desde Node 22.13.0 y 23.5.0. Se activa con `--permission` y permite conceder capacidades concretas, por ejemplo `--allow-fs-read=./config.json` o `--allow-fs-write=./salida`. Consultá `process.permission.has('fs.read', ruta)` sólo para adaptar una experiencia; no la uses como autorización de negocio. El modelo **no es un sandbox de seguridad**: protege contra accesos accidentales de código confiable, tiene limitaciones documentadas y no reemplaza aislamiento del SO, contenedores, usuarios mínimos ni revisión de dependencias.

```bash
node --permission --allow-fs-read=./entrada.txt app.mjs --input ./entrada.txt
```

No otorgues `*` por reflejo: el permiso mínimo útil es más fácil de auditar. Probá tu aplicación con permisos antes de asumir que cada dependencia tiene exactamente los que necesitás.

## Propiedad, límites y observabilidad

Cada handle necesita dueño. Quien crea un servidor decide cuándo deja de aceptar conexiones; quien abre un archivo o stream decide cómo propaga su error y cuándo termina; quien instala un listener temporal lo elimina. Esa regla evita el síntoma engañoso de “Node no sale”: casi siempre quedó un timer, socket, servidor o stream abierto. Para investigar, empezá por el recurso que debería haber terminado, no por un `process.exit()` que sólo tapa la fuga.

Separá además datos de control. Un `Buffer` puede contener datos no confiables; decodificarlo no valida un protocolo. Un nombre de archivo puede ser texto válido y aun así apuntar fuera de la carpeta autorizada. Un evento `line` puede notificar progreso, pero no reemplaza una confirmación de que el `Writable` aceptó o persistió los bytes. Cada frontera necesita su validación, límite de tamaño y política de error explícita.

La observabilidad útil conserva el contexto mínimo: código de salida, señal recibida, operación y error clasificado, pero no secretos ni contenido completo de usuarios. El inspector y los diagnostic reports ayudan a entender un proceso real; no son telemetría segura por defecto. Para una prueba reproducible, registrá la versión de Node y el comando exacto, enviá la señal a un proceso aislado y verificá que el recurso se cerró. No declares que un apagado es seguro sólo porque la función de cierre fue llamada: comprobá el efecto observable.

## Laboratorio guiado

En `starter.mjs` implementá tres fronteras pequeñas para una CLI: `parseOptions` valida `--input` y un límite tomado de CLI o entorno; `readText` acepta un path o `file:` URL, exige un archivo y devuelve UTF-8; `collectLines` consume un `Readable` por chunks, conserva líneas partidas, emite cada línea a un `EventEmitter` y no deja el `Buffer` como texto implícito. No instala handlers globales de señal: eso pertenece al proceso dueño de los recursos, no a una utilidad reutilizable.

1. Ejecutá `node starter.mjs`: debe fallar (RED) hasta que reemplaces los TODO.
2. Validá los argumentos y el entorno antes de tocar `fs`.
3. Consumí el stream con `for await`; un chunk no equivale a una línea.
4. Ejecutá `node solution.mjs` para ver los asserts GREEN. Recién después compará la referencia.

Está terminado cuando podés justificar por qué el error de una CLI va a `stderr`, por qué `fileURLToPath` es preferible a `url.pathname`, por qué un stream no se junta entero sin cota y por qué una excepción no capturada pide salir y reiniciar.

## Recuperación y transferencia

Sin ejecutar, respondé: ¿cuándo sale naturalmente Node? ¿qué diferencia hay entre `exitCode` y `exit()`? ¿qué tipo tiene `process.env.PORT`? ¿qué diferencia hay entre un path y una `file:` URL? ¿qué garantiza `pipeline()`?

Transferí el contrato a una CLI tuya: definí flags, rangos y códigos de salida; procesá un archivo grande sin cargarlo entero; cerrá el servidor y la base al recibir una señal; y dejá un límite de tiempo explícito. Explicá que un handler de `SIGTERM` debe detener admisión y cerrar recursos de forma idempotente. Comprobá también que el Permission Model limita capacidades de Node, pero no vuelve confiable a una dependencia ni reemplaza un sandbox del SO. En V2 empezá con un diagnóstico: antes de ejecutar, predecí qué handles quedan vivos, qué entrada cruza cada frontera y qué salida esperás. Después autoexplicá la decisión, recibí feedback sobre una predicción concreta y revisá la corrección antes de repetirla. Sólo esa práctica y feedback realmente observados pueden convertirse en evidencia; la mastery se deriva de evidencia acumulada, no de leer este README ni de inventar sesiones, resultados o estado.

## Referencias primarias

- [Node.js: Process](https://nodejs.org/api/process.html)
- [Node.js: CLI options](https://nodejs.org/api/cli.html)
- [Node.js: File system](https://nodejs.org/api/fs.html)
- [Node.js: Path](https://nodejs.org/api/path.html)
- [Node.js: URL](https://nodejs.org/api/url.html)
- [Node.js: Buffer](https://nodejs.org/api/buffer.html)
- [Node.js: Events](https://nodejs.org/api/events.html)
- [Node.js: Stream](https://nodejs.org/api/stream.html)
- [Node.js: Diagnostic reports](https://nodejs.org/api/report.html)
- [Node.js: Permission Model](https://nodejs.org/api/permissions.html)
