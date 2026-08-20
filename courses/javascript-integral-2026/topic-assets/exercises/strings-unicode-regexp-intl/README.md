# 4.3 — Strings, Unicode, RegExp, fechas e internacionalización

## El texto que ves no siempre es el dato que recorrés

Cuando una interfaz corta un emoji, una búsqueda no encuentra `José` escrito con teclado distinto o una fecha cambia de día al desplegarla, el bug no vive en un detalle cosmético. El programa eligió una unidad equivocada: una unidad UTF-16 en lugar de un grafema, una representación Unicode en lugar de texto equivalente, una hora local en lugar de un instante con zona. Este capítulo te da un modelo para elegir la unidad y el contrato antes de llamar un método.

Requiere 1.2 y 1.3. Ya sabés que un string es un primitivo y que una conversión no valida por sí sola. Acá sumamos cuatro preguntas prácticas: ¿qué parte de un string querés contar?, ¿qué formato estable estás validando?, ¿un `Date` representa un instante o una fecha de calendario?, ¿en qué locale y zona debe leerlo una persona? La meta no es memorizar todas las APIs de `Intl`: es poder explicar por qué `length`, una regex enorme o la zona local del servidor no alcanzan.

## UTF-16, code points y grafemas

Un string ECMAScript es una secuencia de **unidades de código UTF-16**. `length`, índices con corchetes y varios métodos históricos trabajan en esa unidad. Para gran parte del ASCII parece una letra por posición; fuera de ahí no. Un code point fuera del Basic Multilingual Plane usa dos unidades, llamadas par sustituto.

```js
const idea = '💡';
const composed = 'é';
const decomposed = 'e\u0301';
const family = '👨‍👩‍👧‍👦';
console.log(idea.length); // 2
console.log(idea.charCodeAt(0).toString(16)); // d83d
console.log(idea.codePointAt(0).toString(16)); // 1f4a1
console.log([...composed].length, [...decomposed].length); // 1 2
console.log([...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(family)].length); // 1
```

`charCodeAt` lee una unidad; `codePointAt` recompone el code point cuando empieza en el par correcto. Para iterar por code points, `for...of` y `[...text]` aplican la iteración de strings y no separan ese emoji. Eso mejora `length`, pero todavía no responde “¿cuántos caracteres ve una persona?”.

Un **grafema** puede combinar varios code points: una `e` seguida de una marca aguda combinante se ve como `é`; una familia emoji usa varios símbolos unidos por un Zero Width Joiner. Ambas representaciones tienen fronteras de usuario distintas de los code points.

`Intl.Segmenter` sabe segmentar por `grapheme`, `word` o `sentence`; para un contador visible elegí `grapheme`. No uses `Array.from` como sustituto de un contador de caracteres: cuenta code points y dividiría una secuencia ZWJ. También comprobá disponibilidad si tu runtime objetivo incluye engines viejos o embebidos: `typeof Intl.Segmenter === 'function'` es la capacidad observable, no una suposición por versión de navegador.

No confundas una regla de UI con un límite de almacenamiento. Un campo puede admitir 30 grafemas, mientras la base limita bytes o code units. Esas son dos validaciones distintas; documentalas y probalas por separado. Cortar texto en un índice UTF-16 puede partir un par sustituto o dejar una marca combinante sin base. Si truncás para mostrar, segmentá primero y uní segmentos completos.

## Normalización: equivalencia, no amnesia

Unicode permite más de una secuencia para el mismo texto visible. `é` puede llegar como U+00E9 o como `e` + U+0301. La igualdad estricta compara code units, así que esas dos entradas no son iguales hasta que elegís una normalización.

```js
const a = 'Café';
const b = 'Cafe\u0301';
console.log(a === b); // false
console.log(a.normalize('NFC') === b.normalize('NFC')); // true
```

NFC compone secuencias cuando Unicode define una forma compuesta. Para claves de búsqueda o deduplicación que deben conservar el idioma, normalizá de ambos lados y definí aparte la política de mayúsculas. El laboratorio usa `NFC` y `toLowerCase`; no elimina diacríticos. `José` y `Jose` pueden ser usuarios, lugares o términos diferentes. Quitar acentos para “hacer matching amable” cambia los datos y necesita una decisión de producto, no un helper escondido.

NFD descompone y NFKC/NFKD aplican compatibilidad. Las formas de compatibilidad pueden colapsar caracteres que se ven distintos o tienen semántica de dominio distinta; por eso no son un saneamiento genérico para IDs, contraseñas ni firmas. La normalización tampoco resuelve confusables entre alfabetos: una `a` latina y una cirílica pueden parecerse sin ser equivalentes. Para seguridad, definí un repertorio permitido, un protocolo y el lugar exacto donde se normaliza; nunca deduzcas identidad visualmente.

La normalización es útil antes de comparar valores ya aceptados, no una alternativa a validarlos. Si la API acepta un código ASCII, validá ASCII explícitamente. Si acepta un nombre internacional, conservá el original para mostrar y guardá una clave normalizada sólo si el modelo la necesita. Así podés explicar qué representás, qué mostrás y qué comparás.

## RegExp: formato pequeño, límites explícitos

Una expresión regular describe una familia de strings, no “texto humano”. Es una herramienta buena para un token local y estable —un código de reserva, una etiqueta o una línea con estructura fija—, pero no para parsear HTML, JSON arbitrario o una gramática con anidamiento. Primero escribí ejemplos válidos e inválidos; recién entonces elegí anclas, grupos y límites.

Los grupos nombrados hacen que el resultado comunique el campo que extrajiste. Los lookarounds prueban contexto sin consumirlo. Con la bandera `u`, las propiedades Unicode permiten hablar de letras y números más allá de ASCII.

```js
const reference = /(?<![\p{L}\p{N}_])(?<id>RES-\d{6})(?![\p{L}\p{N}_])/u;
const complete = /^RES-[0-9]{6}$/;
console.log(reference.exec('Confirmada: RES-120045.')?.groups.id); // RES-120045
console.log(reference.test('xRES-120045')); // false
console.log(complete.test('RES-120045-extra')); // false
```

El lookbehind negativo evita que el token empiece en medio de una palabra; el lookahead equivalente protege el final. `\p{L}` y `\p{N}` requieren `u`; `\w` no significa “cualquier letra internacional”, sino su clase histórica cercana a ASCII. Usá `exec` cuando necesitás grupos; usá `test` para una condición sin extraer. Si la regex tiene estado global (`g` o `y`), `test` mueve `lastIndex`: no reutilices esa instancia para validación sin entender ese estado.

El motor puede explorar alternativas y volver atrás: eso es **backtracking**. Un patrón ambiguo como `/(a+)+$/` parece compacto, pero sobre un string largo de `a` que termina con otro carácter deja muchas formas de repartir los `a`; el tiempo puede crecer de manera inaceptable. No hace falta conocer cada optimización del engine para evitarlo: anclá formatos, poné máximos, evitá cuantificadores anidados ambiguos y rechazá entrada excesiva antes de buscar. Si el dato tiene escapes, recursión o reglas contextuales, escribí un parser chico y testeable.

`complete` es la política cuando el input completo **debe ser** el código; `reference` busca un token dentro de una oración. Elegir una u otra es un contrato, no una preferencia de sintaxis. No agregues `i`, `m`, `s` o `g` por reflejo: cada bandera cambia qué lenguaje acepta el patrón.

## Date, zonas horarias y relojes

`Date` representa un **instante**: un número de milisegundos desde Unix epoch. No guarda una zona horaria de origen ni un calendario civil. Cuando construís `new Date('2026-08-20T12:00:00Z')`, la `Z` define UTC; `getHours()` lo muestra en la zona local del proceso y `getUTCHours()` en UTC. El mismo instante puede ser otro día en otra zona.

```js
const instant = new Date('2026-08-20T02:30:00Z');
console.log(instant.toISOString()); // 2026-08-20T02:30:00.000Z
console.log(
  new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(instant),
); // 19/8/26, 23:30 (la puntuación exacta depende de los datos ICU)
```

Una fecha de calendario (`2026-08-20`) no es un instante. Tampoco una cita a las 09:00 tiene significado completo sin zona y reglas de transición. Las horas locales pueden ser ambiguas o inexistentes cuando cambia el horario de verano. Para transporte y almacenamiento de un instante usá una representación con `Z` u offset explícito, por ejemplo `2026-08-20T12:00:00Z` o `2026-08-20T12:00:00-03:00`; el laboratorio rechaza `2026-08-20T12:00:00` antes de `new Date`, porque cada zona del proceso podría convertirlo en un instante distinto. También acepta `Date` válido o epoch numérico, y luego valida la fecha construida. Para mostrarla, entregale a `Intl.DateTimeFormat` el instante, locale y `timeZone` explícitos. No construyas una fecha visible concatenando `getMonth() + 1`: el orden, calendario, dígitos y separadores son decisiones de locale.

Un reloj del sistema tampoco es una fuente de orden universal. `Date.now()` puede moverse si el sistema corrige su reloj; sirve para una marca de tiempo observada, no para medir intervalos sensibles. En el browser, `performance.now()` es monotónico para medir duración dentro del proceso; en Node, consultá la API de tiempo apropiada para duración. No inventes una conversión entre un reloj monotónico y una fecha de calendario: registrá ambos si el diagnóstico realmente los necesita.

## ECMA-402 y Temporal según el runtime

ECMA-402 agrupa operaciones sensibles a idioma y región. `Intl.NumberFormat` presenta números, monedas y porcentajes; `Intl.DateTimeFormat` presenta fechas; `Intl.Collator` compara u ordena texto; `Intl.Segmenter` encuentra fronteras de texto. Formatear no redondea ni convierte tu modelo de dinero: recibí una cantidad numérica correcta para el dominio y especificá moneda.

```js
const amount = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(
  1234.5,
);
const equal = new Intl.Collator('es', { sensitivity: 'base' }).compare('Árbol', 'arbol') === 0;
const temporalState = typeof globalThis.Temporal === 'undefined' ? 'no disponible' : 'disponible';
console.log(amount, equal, temporalState); // $ 1.234,50 true y estado dependiente del runtime
```

`Collator` ofrece una comparación de presentación, no una regla de unicidad de cuentas. La sensibilidad `base` puede ignorar diferencias de acento y caso: es útil para una lista amigable, no para decidir que dos identidades son la misma. Reutilizá una instancia en una lista grande en vez de crear una por comparación.

`Temporal` separa explícitamente instantes, fechas civiles, horas, duraciones y zonas. En este curso se trata como capacidad de ES2027 dependiente del runtime: no presupongas `globalThis.Temporal`, no agregues un polyfill en el ejercicio y no cambies la ruta de `Date` + `Intl` sólo porque una demo local lo expone. `temporalState` detecta la capacidad antes de acceder. Ese resultado no califica al runtime como “moderno” o “viejo”; sólo dice qué contrato puede ejecutar hoy. Las dependencias de plataforma se prueban en los runtimes que soportás.

## Laboratorio: recibo internacional sin sorpresas

En `starter.mjs` implementá cinco operaciones para un recibo de reserva. `graphemeCount(text, locale)` acepta sólo string y cuenta grafemas, fallando claramente si falta `Intl.Segmenter`. `normalizeLookup(text)` produce NFC en minúscula sin borrar acentos. `parseReservationReference(text)` extrae un token `RES-` de seis dígitos sólo cuando no está pegado a letra, número o `_`. `formatReservation(amount, instant, locale, timeZone, currency)` acepta sólo `Date` válido, epoch numérico o string terminado en `Z`/`z` u offset `±HH:MM`; rechaza el string sin zona antes de `new Date`, valida el resultado y devuelve `{ amount, date }` formateados por `Intl`. `sameDisplayName(a, b, locale)` compara con `Intl.Collator` de sensibilidad base. `temporalAvailable()` hace feature detection y no toca Temporal si no existe.

`node starter.mjs` empieza RED; implementá hasta que pase. `solution.mjs` es referencia posterior y termina GREEN con sus asserts. Pista 1: `length` no cuenta grafemas. Pista 2: separá “encontrar token dentro de texto” de “validar que todo el texto sea token”. Pista 3: `new Date(instant)` puede producir una fecha inválida; verificá `valueOf()` antes de formatear.

Está terminado cuando cubrís emoji ZWJ, forma descompuesta, acentos que no deben borrarse, token pegado a texto Unicode, importe no finito, `Date` inválido, epoch numérico, string con `Z`, string sin zona rechazado antes de `Date`, zona explícita, colación y el estado real de Temporal. Registrá el input exacto cuando un borde falle: “emoji roto” no es evidencia reproducible; `👨‍👩‍👧‍👦` y la operación aplicada sí lo son.

Recuperación: ¿qué cuenta `length`? ¿por qué NFC cambia una comparación sin “corregir” el nombre? ¿cuándo necesitás `u` y `\p{L}`? ¿qué representa `Date`? ¿por qué `??` no arregla una zona horaria ausente? Transferí el laboratorio a un límite de nombre visible en un formulario y a un recibo de cobro que deba mostrarse en Buenos Aires y Tokio desde el mismo instante. En ambos casos escribí primero la unidad y la zona que el contrato exige.

En V2 empezá por el diagnóstico socrático: predecí unidades, match y fecha antes de ejecutar. En tu autoexplicación decí qué representación comparaste y qué zona elegiste. El feedback puede corregir, por ejemplo, que contaste code points en vez de grafemas; la corrección sirve para la siguiente práctica. Sólo una práctica, quiz o evaluación realmente observados generan evidencia; el mastery se deriva de esa evidencia, no de haber leído este README. A las 48 horas, sin apuntes, explicá por qué `e\u0301`, `RES-120045`, `2026-08-20T02:30:00Z` y `Temporal` requieren contratos distintos, y resolvé un recibo para una zona no local.

## Referencias primarias

- [ECMA-262 2026: String objects y code points](https://tc39.es/ecma262/2026/multipage/text-processing.html)
- [ECMA-262 2026: RegExp y Unicode property escapes](https://tc39.es/ecma262/2026/multipage/text-processing.html#sec-patterns)
- [ECMA-262 2026: Date objects](https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html#sec-date-objects)
- [ECMA-402: Intl.NumberFormat, DateTimeFormat y Collator](https://tc39.es/ecma402/)
- [ECMA-402: Intl.Segmenter](https://tc39.es/ecma402/#sec-intl.segmenter)
- [TC39 Temporal](https://tc39.es/proposal-temporal/)
