# 4.2 — Memoria binaria, TypedArray y serialización

## Cuando un valor ya no alcanza

Un string, un objeto y un array son cómodos mientras todos hablan JavaScript y el dato vive dentro del mismo proceso. Un archivo PNG, un paquete de red, audio PCM o una clave criptográfica no son “texto raro”: son una secuencia precisa de bytes. En ese momento importa cuánto ocupa cada campo, en qué orden van los bytes y quién puede seguir usándolos.

Este capítulo usa lo visto en arrays, Map y Set para pasar de colecciones de valores a almacenamiento binario. La pregunta guía es concreta: si mandás el número `258`, ¿el receptor puede reconstruir exactamente esos dos bytes? La respuesta depende de la vista, del endianness y del contrato, no de que ambos lados usen JavaScript.

Requiere 4.1. La meta es elegir `Uint8Array` para bytes, `DataView` para formatos con campos heterogéneos, `SharedArrayBuffer` sólo cuando la coordinación entre agentes lo justifica, y una serialización que declare codificación, tamaño y compatibilidad.

## Un buffer no interpreta nada; las vistas sí

`ArrayBuffer` es una región de memoria binaria de longitud fija. No tiene índices útiles por sí mismo: necesitás una **vista**. `Uint8Array` ve cada posición como un entero sin signo de 8 bits; `Int16Array` la agrupa en enteros de 16 bits con signo; `Float32Array` la interpreta como números de punto flotante. Las vistas no copian el almacenamiento salvo que una API lo diga: pueden compartir los mismos bytes.

```js
const buffer = new ArrayBuffer(4);
const bytes = new Uint8Array(buffer);
const words = new Uint16Array(buffer);
bytes.set([0x34, 0x12]);
console.log(bytes[0], bytes[1]); // 52 18
console.log(words[0]); // 4660 en una máquina little-endian habitual
```

La última salida no es un formato portable: un TypedArray multibyte usa el orden nativo de la plataforma. Para recorrer muestras homogéneas locales está perfecto; para definir bytes de disco o red no alcanza. Tampoco confundas `byteLength` con `length`: un `Uint16Array` de cuatro bytes tiene `length === 2` y `byteLength === 4`. Cada constructor exige que `byteOffset` y el largo respeten la alineación de su elemento; `new Uint16Array(buffer, 1)` falla porque 1 no es múltiplo de 2.

Podés crear una ventana sin copiar:

```js
const bytes = Uint8Array.of(10, 20, 30, 40);
const middle = new Uint8Array(bytes.buffer, 1, 2);
middle[0] = 99;
console.log([...bytes], [...middle]); // [10, 99, 30, 40] [99, 30]
```

`subarray(1, 3)` también crea una vista compartida; `slice(1, 3)` crea un buffer nuevo. Elegí esa diferencia por propiedad: una vista es excelente para parsear sin copia, pero es un alias. Si devolvés una vista que sigue apuntando a un buffer reutilizado por un pool, el llamador puede observar bytes que cambian después. Si la API promete snapshot, copiá de forma explícita.

`SharedArrayBuffer` también es almacenamiento binario, pero puede ser accedido por más de un agente. No se “sincroniza solo”: la memoria compartida agrega carreras. Leelo mediante vistas y coordiná accesos relevantes con `Atomics`; en navegador requiere además el aislamiento apropiado del documento. No lo elijas para evitar una copia casual. Elegilo cuando workers necesitan una región compartida y podés escribir un protocolo de propiedad, estados y espera. Si transferir el trabajo alcanza, un `ArrayBuffer` suele ser el contrato más simple.

```js
const shared = new SharedArrayBuffer(4);
const counter = new Int32Array(shared);
Atomics.add(counter, 0, 1);
console.log(Atomics.load(counter, 0)); // 1
```

La vista importa: `Atomics` acepta sólo ciertos TypedArray de enteros. Una escritura ordinaria en un buffer compartido no te da una operación atómica ni establece por sí sola el orden que necesita tu algoritmo. Coordinación no es un detalle de serialización; es parte del diseño concurrente. En Node verificá `typeof SharedArrayBuffer === 'function'`; en browser verificá también el contexto de seguridad y tratá la ausencia como una capacidad, no como un bug del usuario.

## TypedArray para lotes, DataView para protocolos

Los TypedArray tienen métodos parecidos a Array (`set`, `map`, `find`, `subarray`) pero sus elementos son números dentro de un dominio fijo. `Uint8Array` reduce cada asignación módulo 256; `Uint8ClampedArray` satura, útil para píxeles; `BigInt64Array` y `BigUint64Array` usan BigInt. No uses una conversión silenciosa como validación de frontera: si `300` no es un byte válido para tu protocolo, rechazalo antes de guardarlo en `Uint8Array`, porque se convertiría en `44`.

`DataView` no expone una secuencia homogénea. Expone getters y setters por offset: `getUint8`, `getInt32`, `getFloat64`, `setUint16`, y sus variantes BigInt. Es la herramienta para un header seguido de payload: elegís el tipo y el byte order en cada campo. El tercer argumento de sus operaciones multibyte es `littleEndian`; `false` u omitido significa big-endian.

```js
const buffer = new ArrayBuffer(2);
const view = new DataView(buffer);
view.setUint16(0, 0x1234, false); // contrato: big-endian
console.log([...new Uint8Array(buffer)]); // [18, 52]
console.log(view.getUint16(0, true)); // 13330: interpretación equivocada
```

No preguntes “qué endianness usa JavaScript”; el host tiene uno nativo, pero `DataView` permite que el formato sea independiente de él. Elegí y documentá uno. Los protocolos de red suelen hablar de network byte order (big-endian), pero seguí la especificación del protocolo real. Para un formato binario, anotá por campo: offset, tipo, endianness, rango y largo. Eso evita que un entero correcto se convierta en un mensaje inválido.

El largo nunca es decorativo. Antes de leer `size` bytes, verificá que el header exista y que `size` coincida con lo disponible. Un `RangeError` del motor no sustituye un error de protocolo claro; peor, confiar en el header sin límite puede llevar a reservar o procesar entradas enormes. El laboratorio codifica `version`, `flags`, un largo UTF-8 `uint16` big-endian y el texto. El contrato rechaza payload truncado y bytes sobrantes: ambos muestran que emisor y receptor no acordaron el formato.

## Redimensionar y transferir cambia qué sigue vivo

Un `ArrayBuffer` redimensionable se construye con un máximo y expone `resize`; no todos los runtimes actuales lo implementan. Si está disponible, una vista de largo automático puede crecer o achicarse con el buffer. Una vista de largo fijo puede quedar fuera de límites después de un achique. Eso es útil para un acumulador muy controlado, pero agrega estados que una colección común no tiene.

```js
if ('resize' in ArrayBuffer.prototype) {
  const buffer = new ArrayBuffer(4, { maxByteLength: 16 });
  const bytes = new Uint8Array(buffer); // vista de largo automático
  buffer.resize(8);
  console.log(bytes.byteLength); // 8
}
```

No pongas esa rama como requisito universal: hacé feature detection antes de construirlo. También revisá `buffer.resizable` si necesitás diferenciar un buffer recibido. `transfer` y `transferToFixedLength`, cuando existan, mueven el almacenamiento a un buffer nuevo y dejan el original **detached**. Una transferencia por `postMessage` con transfer list produce el mismo cambio de propiedad: las vistas del emisor ya no tienen bytes utilizables. No es una copia barata; es ceder el recurso.

```js
const buffer = new ArrayBuffer(2);
const before = new Uint8Array(buffer);
before.set([7, 9]);
const moved = buffer.transfer?.();
if (moved) console.log([...new Uint8Array(moved)]); // [7, 9]
```

Usá `?.` o una comprobación de función porque `transfer` depende del runtime. Después de transferir, invalidá referencias del lado emisor en tu modelo mental y en tu API. No guardes una vista “por las dudas”. `SharedArrayBuffer` no se transfiere: se comparte, precisamente porque la propiedad no se mueve. Para mandar una copia aislada, construí un nuevo `Uint8Array` y transferí su `buffer` si la frontera lo permite.

## Bytes como hexadecimal y base64

Hexadecimal y base64 son textos que representan bytes. Hex usa dos caracteres por byte y es muy bueno para logs; base64 ocupa aproximadamente cuatro caracteres cada tres bytes y es común en JSON, URLs con una variante adecuada y cabeceras. Ninguno decide cómo transformar caracteres JavaScript a bytes: esa es una decisión anterior.

ES2026 suma métodos directos de `Uint8Array`: `Uint8Array.fromHex`, `Uint8Array.fromBase64`, `bytes.toHex()` y `bytes.toBase64()`. Son una mejora sobre construir strings intermedios, pero tu código no puede suponerlos en un runtime anterior. Detectá la capacidad concreta:

```js
const supportsBase64 = typeof Uint8Array.fromBase64 === 'function';
const supportsHex = typeof Uint8Array.prototype.toHex === 'function';
console.log(supportsBase64, supportsHex); // depende del runtime
```

En Node, el laboratorio usa esos métodos cuando existen y `Buffer` como fallback local. En browser no importes `Buffer` por reflejo: elegí un fallback apto para ese host o elevá el requisito de versión. `btoa` y `atob` trabajan con strings de bytes Latin-1, no con texto Unicode arbitrario; pasarles `'ñ'` no es un sustituto de UTF-8. Para datos de usuario: `new TextEncoder().encode(text)` primero, base64 después.

```js
const text = 'ñandú';
const bytes = new TextEncoder().encode(text);
console.log([...bytes]); // [195, 177, 97, 110, 100, 195, 186]
console.log(new TextDecoder().decode(bytes)); // ñandú
```

`TextEncoder` codifica UTF-8. `TextDecoder('utf-8', { fatal: true })` rechaza secuencias inválidas en vez de reemplazarlas silenciosamente; para una frontera de protocolo eso suele ser más honesto. Decodificar no valida todo tu mensaje: después comprobá versión, longitudes, rangos y semántica. Un byte bien formado no prueba que el cliente esté autorizado ni que el campo tenga sentido.

## Serializar no es clonar cualquier cosa

JSON describe strings, números finitos, booleanos, null, arrays y objetos con limitaciones. Pierde prototipos y `undefined` en objetos, no representa BigInt sin una política, falla con ciclos y no vuelve un `ArrayBuffer` un formato binario intercambiable. `JSON.stringify(new Uint8Array([1, 2]))` produce una estructura de objeto dependiente de esa representación, no un contrato que debas usar para bytes.

`structuredClone` puede copiar más tipos y preserva ciclos, y ciertas APIs permiten transferir ArrayBuffer para evitar la copia. Pero tampoco es una especificación de wire format entre versiones, lenguajes o almacenamiento duradero. Una serialización estable necesita versión, encoding, límites y política para datos desconocidos. Para un paquete chico, el header del laboratorio hace explícito cuatro de esas decisiones: versión de formato, flags, largo máximo y UTF-8.

Definí límites antes de asignar. Si recibís base64, limitá tanto el texto entrante como los bytes decodificados. Si el header anuncia un `uint32`, decidí un máximo de aplicación menor que el máximo matemático. Rechazá trailing bytes cuando tu mensaje debe consumir todo el buffer; aceptalos sólo si el protocolo declara concatenación o extensiones. Ser preciso acá no es burocracia: impide que un parser acepte mensajes ambiguos y deja una migración posible para la versión siguiente.

## Laboratorio: un paquete UTF-8 verificable

En `starter.mjs`, implementá `encodePacket`, `decodePacket`, `encodeBytes` y `decodeBytes`. El paquete es exactamente `[version:uint8, flags:uint8, payloadLength:uint16 BE, payload:utf8]`. Version y flags son bytes; el texto debe ocupar como máximo 65535 bytes, no caracteres. `decodePacket` acepta sólo `Uint8Array`, exige header completo y rechaza tanto truncamiento como trailing bytes. `encodeBytes` devuelve hexadecimal y base64; `decodeBytes` exige que ambas formas den los mismos bytes.

`node starter.mjs` empieza RED. Completalo hasta GREEN y recién después mirá `solution.mjs`. La solución hace feature detection de `toHex`/`fromHex` y `toBase64`/`fromBase64`, con fallback de Node para que el ejercicio corra en runtimes anteriores. No copies un fallback al browser sin cambiarlo: la capacidad depende del host.

Pista 1: `TextEncoder().encode(text).byteLength` mide el payload, no `text.length`. Pista 2: el flag `false` en `setUint16` y `getUint16` fija big-endian. Pista 3: construí `DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)` para respetar un `subarray`.

Está listo cuando los asserts verifican la traza de `'ñandú'`, el largo big-endian, truncamiento, trailing bytes, bytes incompatibles y los límites de versión y payload. Para transferir: diseñá un worker que reciba `packet.buffer` y explicá qué vista queda detached en el emisor. Para una segunda transferencia, cambiá el header a `uint32` y fijá un máximo de aplicación explícito: no alcanza con aceptar 4 GiB porque el tipo puede representarlo.

Recuperación: ¿por qué `text.length` no sirve para el header de `'ñandú'`? ¿Qué vistas comparten almacenamiento? ¿Qué argumento de `DataView` fija big-endian? ¿Por qué transferir no es copiar? ¿Qué diferencia observable hay entre `subarray` y `slice`? Respondelas sin ejecutar antes de pasar al diagnóstico.

En V2 empezá con diagnóstico socrático: sin ejecutar, ¿por qué `text.length` no sirve para el header de `'ñandú'`? Autoexplicá cuál vista comparte memoria, qué campo usa big-endian y por qué una transferencia no es una copia. El feedback puede corregir una confusión entre bytes y caracteres o entre shared y transferred. Sólo esa práctica y evaluación observadas generan evidencia; no declares mastery por leer la solución. En 48 horas, reconstruí el formato desde una secuencia hex, anotá offsets y predicá qué caso debería rechazar el decoder.

## Referencias primarias

- [ECMA-262 2026: ArrayBuffer objects](https://tc39.es/ecma262/2026/multipage/structured-data.html#sec-arraybuffer-objects)
- [ECMA-262 2026: TypedArray objects](https://tc39.es/ecma262/2026/multipage/indexed-collections.html#sec-typedarray-objects)
- [ECMA-262 2026: DataView objects](https://tc39.es/ecma262/2026/multipage/structured-data.html#sec-dataview-objects)
- [ECMA-262 2026: SharedArrayBuffer y Atomics](https://tc39.es/ecma262/2026/multipage/structured-data.html#sec-sharedarraybuffer-objects)
- [ECMA-262 2026: Uint8Array base64 y hexadecimal](https://tc39.es/ecma262/2026/multipage/indexed-collections.html#sec-uint8array-objects)
- [WHATWG Encoding: TextEncoder y TextDecoder](https://encoding.spec.whatwg.org/)
- [Node.js: worker_threads y transferencia de ArrayBuffer](https://nodejs.org/api/worker_threads.html)
