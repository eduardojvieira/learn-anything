# 3.3 — Symbols, Proxy, Reflect y datos estructurados

## Por qué importa

Un objeto JavaScript no es sólo un diccionario de strings. Puede tener claves con identidad única, cambiar cómo participa de un protocolo del lenguaje y pasar por una capa que observa operaciones. Eso da herramientas precisas para modelar datos; también crea trampas si se confunden mecanismos del estándar con capacidades del navegador o de Node.

Este capítulo separa tres niveles. **ECMA-262** define `Symbol`, `Proxy`, `Reflect`, `JSON` y las reglas de sus operaciones. Un runtime ejecuta esa especificación. `structuredClone` pertenece a la plataforma host: lo definen HTML y los hosts que lo exponen, no el núcleo de ECMA-262. Que una característica figure en ES2026 o exista en tu Node no prueba soporte universal.

## Objetivos observables

Al terminar podés predecir qué clave usa una operación, escribir un iterable con `Symbol.iterator`, explicar por qué un trap no puede mentir sobre el target, delegar una operación con `Reflect`, serializar una representación acordada de `BigInt`, detectar `context.source` y elegir entre `structuredClone`, una copia de dominio o un error explícito.

## Symbol: identidad, no texto secreto

`Symbol('cache')` crea un valor primitivo único. La descripción ayuda al debugger, pero no participa de la identidad: dos llamadas con la misma descripción siguen siendo distintas. Sirve para una propiedad interna que no debe chocar accidentalmente con una clave string conocida. No es privacidad ni seguridad: `Object.getOwnPropertySymbols(obj)` puede verla y cualquiera que reciba el símbolo puede usarla.

`Symbol.for('app.cache')` consulta el registro global de símbolos del agente. Dos módulos que consultan la misma clave reciben el mismo símbolo; `Symbol.keyFor` devuelve esa clave sólo para símbolos de ese registro. Usalo cuando compartir esa identidad sea parte del contrato. Para una marca local, `Symbol()` es más claro y evita acoplamiento invisible.

Los _well-known symbols_ son símbolos ya definidos por el lenguaje. No son etiquetas libres: una operación del lenguaje los consulta. `Symbol.iterator` determina cómo `for...of`, spread de iterables y `Array.from` obtienen un iterador. `Symbol.toStringTag` cambia la etiqueta que observa `Object.prototype.toString`. Implementar uno es implementar un protocolo: respetá sus precondiciones y el valor que debe devolver.

## Ejemplo A — un rango iterable

    const range = {
      from: 2,
      to: 4,
      *[Symbol.iterator]() {
        for (let n = this.from; n <= this.to; n += 1) yield n;
      },
    };
    console.log([...range]); // [2, 3, 4]

La clave computada es el símbolo que el lenguaje busca. El método devuelve un iterador —el generador lo hace—, no un array. Si el rango permite `from > to`, decidí si produce vacío o si lo rechazás; `solution.mjs` lo rechaza para hacer visible el contrato.

## Proxy: interceptar sin cambiar la realidad

`new Proxy(target, handler)` crea una vista que puede interceptar operaciones: lectura (`get`), escritura (`set`), borrado (`deleteProperty`), definición (`defineProperty`), enumeración (`ownKeys`), llamada (`apply`) y construcción (`construct`), entre otras. Un trap recibe la operación antes de que llegue al target. Eso es útil para validación localizada, observabilidad, compatibilidad o virtualización; no es un permiso mágico para alterar las reglas del objeto.

Las invariantes son el límite importante. Si una propiedad propia del target es no configurable, `ownKeys` debe incluirla. Un `getOwnPropertyDescriptor` no puede fingir que no existe. Si el target no es extensible, `ownKeys` no puede agregar ni quitar claves. Un `deleteProperty` no puede informar éxito al borrar una propiedad no configurable. Cuando un trap rompe una de estas promesas, el motor lanza `TypeError`, aunque el trap haya devuelto un valor aparentemente válido.

Tampoco uses Proxy como frontera de seguridad: el código que conserva una referencia a `target` lo modifica sin pasar por los traps. Una validación que protege datos frente a entrada no confiable tiene que estar en una frontera real —por ejemplo, al decodificar una solicitud— y no sólo en un proxy compartido por convenio.

## Ejemplo B — validar y delegar

    const target = {};
    const user = new Proxy(target, {
      set(object, key, value, receiver) {
        if (key === 'age' && (!Number.isInteger(value) || value < 0)) {
          throw new RangeError('age');
        }
        return Reflect.set(object, key, value, receiver);
      },
    });
    user.age = 20;
    console.log(target.age); // 20

El trap añade una regla y después delega. Si devolviera `true` sin escribir, mentiría a la persona que asignó aunque quizá no viole una invariante; esa semántica sorprendente es un bug de diseño. Si sólo querés registrar, llamá a `Reflect.set` y devolvé su booleano.

## Reflect: operaciones ordinarias, resultados explícitos

`Reflect` expone operaciones fundamentales con una forma uniforme. `Reflect.get(object, key, receiver)` lee; el `receiver` importa para getters heredados. `Reflect.set` escribe y devuelve `true` o `false`, en vez de depender de una asignación que en modo estricto puede lanzar. `Reflect.defineProperty` y `Reflect.deleteProperty` también devuelven booleanos. `Reflect.ownKeys` reúne strings y symbols, incluso no enumerables. `Reflect.apply(fn, thisArg, args)` llama sin tomar prestado `Function.prototype.apply`.

No es una API host: estas operaciones son parte de ECMA-262. Dentro de un trap, `Reflect` evita reimplementar la semántica ordinaria y, sobre todo, evita la recursión accidental de `proxy[key]` o `proxy[key] = value`.

## Ejemplo C — una invariante que el motor defiende

    const target = {};
    Object.defineProperty(target, 'id', { value: 1, configurable: false });
    const proxy = new Proxy(target, { ownKeys: () => [] });
    console.log(Reflect.ownKeys(proxy)); // TypeError

No arregles esto capturando el error y continuando: el handler está mal. La versión correcta devuelve `Reflect.ownKeys(target)` y sólo transforma algo que las invariantes permitan transformar.

## JSON: un formato, no una copia del objeto

JSON representa `null`, booleanos, números finitos, strings, arrays y objetos con claves string. No representa `undefined`, funciones, símbolos, ciclos, `Map`, `Set` ni `BigInt` tal como son. En objetos, `JSON.stringify` omite `undefined`, funciones y símbolos; en arrays los transforma en `null`. Ante un ciclo o un `BigInt` sin adaptación lanza `TypeError`.

El `replacer` de `JSON.stringify` transforma valores antes de escribir texto. Puede ser una función o una lista de claves. El `reviver` de `JSON.parse` transforma de abajo hacia arriba después de leer el texto. Ambos son código ejecutado sobre datos: no reconstituyas clases, URLs o permisos por una etiqueta que venga de una fuente no confiable sin validar el esquema completo.

## Ejemplo D — contrato explícito para BigInt

    const text = JSON.stringify({ amount: 42n }, (_key, value) =>
      typeof value === 'bigint' ? { $bigint: value.toString() } : value,
    );
    const record = JSON.parse(text, (_key, value) =>
      value && typeof value === 'object' && '$bigint' in value
        ? BigInt(value.$bigint)
        : value,
    );
    console.log(record.amount === 42n); // true

`$bigint` es un protocolo de tu aplicación, no una capacidad de JSON. Reservá esa forma o validá que el objeto tenga exactamente esa clave, como hace la solución; de lo contrario un dato normal podría interpretarse como un `BigInt` por accidente. En este laboratorio el valor debe ser un string decimal canónico: `0`, `42` o `-42`. Se permite el signo menos para enteros negativos, pero no `+42`, `01`, `-0`, `1.0`, `1e3` ni `0x2`; tampoco un número JSON. Así el reviver no convierte un `Number` que ya pudo llegar redondeado.

### Acceso al source en ES2026

La extensión de ES2026 para `JSON.parse` entrega un tercer argumento `context` al reviver para valores primitivos. `context.source` conserva el fragmento JSON original. Es útil cuando el número ya perdió precisión como `Number`: podés crear `BigInt(context.source)` para `9007199254740993` antes de basarte en el `Number` redondeado.

No lo supongas disponible. Detectalo ejecutando un parse mínimo, no por versión ni user agent:

    let hasSource = false;
    JSON.parse('0', (_key, value, context) => {
      hasSource = value === 0 && context?.source === '0';
      return value;
    });
    console.log(hasSource); // depende del runtime

Si falta, no intentes recuperar precisión de un `Number` ya redondeado. Cambiá el contrato de transporte: enviá el identificador exacto como string y validalo. `parseExactId` en la solución falla de forma explícita para que ese cambio no quede oculto.

## Structured clone: algoritmo de plataforma

`globalThis.structuredClone` es una API host basada en el algoritmo de clon estructurado de HTML. En hosts que la expongan, construye un grafo nuevo y puede copiar `Date`, `RegExp`, `Map`, `Set`, `ArrayBuffer` y muchos valores integrados. Mantiene ciclos y referencias internas del grafo. No clona funciones, nodos DOM ni proxies; esos casos producen `DataCloneError` u otro error del host.

## Ejemplo E — detectar y clonar

    if (typeof globalThis.structuredClone !== 'function') {
      throw new Error('structuredClone unavailable');
    }
    const original = { when: new Date('2026-01-01'), tags: new Set(['js']) };
    const copy = structuredClone(original);
    console.log(copy !== original, copy.when instanceof Date); // true true

Un `transfer` puede mover un `ArrayBuffer` en vez de copiarlo; el buffer original queda _detached_. Es una decisión de propiedad, no una optimización inocente. Usalo sólo si quien entrega el buffer deja de poder leerlo y ese cambio forma parte del contrato.

La palabra "estructurado" tampoco significa "todo objeto JavaScript". Una instancia puede volver como un objeto de otra forma o no ser clonable según su tipo; revisá el contrato del tipo concreto en el host objetivo. Si el dato cruza procesos, pestañas o almacenamiento durable, definí primero el formato que aceptás. Clonar conserva valores compatibles durante una operación de plataforma; no sustituye validación, autorización ni versionado de datos.

## Errores frecuentes y límites

No confundas una clave symbol con dato oculto; no ocultes invariantes con traps; no uses `JSON.stringify/parse` como clon profundo; no prometas `structuredClone` en todos los runtimes; y no conviertas cualquier `context.source` en `BigInt` sin restringirlo a un literal entero. Para una copia de dominio, escribir una transformación de datos explícita suele ser mejor que intentar preservar todos los tipos.

## Laboratorio guiado

Completá `starter.mjs`. El contrato observable es: `makeRange(2, 4)` se expande a `[2, 3, 4]` y rechaza límites inválidos; `protectId` exige desde la entrada una propiedad propia `id` string, sólo acepta strings en asignaciones posteriores y no permite borrarla; `jsonWithBigInt({ amount: 42n })` recupera `42n` y rechaza etiquetas `$bigint` malformadas; `parseExactId` usa `context.source` o falla explicando el formato alternativo; `cloneData` conserva un `Date` y un `Map` en un host compatible.

Pista 1: una clave de protocolo se escribe como `[Symbol.iterator]`. Pista 2: dentro de un trap, delegá en `Reflect` sobre el target, no sobre el proxy. Pista 3: hacé un parse de `'0'` para observar `context?.source` antes de depender de él.

Está terminado cuando `node starter.mjs` falla por los TODO, `node solution.mjs` termina con código 0 y podés explicar qué parte corresponde a ECMA-262 y cuál al host.

## Recuperación, transferencia y seguimiento V2

Sin mirar el texto, respondé: ¿por qué dos `Symbol('x')` no son iguales?, ¿qué invariante rompe `ownKeys: () => []` sobre una clave no configurable?, ¿qué devuelve `Reflect.set`?, ¿qué pierde JSON? y ¿qué debe pasar con un buffer transferido? Después transferí la idea a dos casos: diseñá un formato JSON para un importe exacto y elegí una copia segura para una cola de mensajes que contiene `Map` y `Date`.

En el diagnóstico socrático de V2, justificá cada predicción con entrada, operación, resultado e invariante. El feedback puede corregir una explicación confundida; la corrección sólo cuenta cuando existe una respuesta observada. No inventes sesiones, evidencia ni mastery: diagnóstico, autoexplicación y práctica registrados son los que alimentan el scheduler y el mastery derivado. En 48 horas resolvé un caso nuevo sin apuntes: recibís JSON con un ID grande, una función y una fecha; definí qué rechazás, qué representás y qué capability del host detectás.

## Referencias primarias

- [ECMA-262: Symbol Objects](https://tc39.es/ecma262/#sec-symbol-objects)
- [ECMA-262: well-known symbols](https://tc39.es/ecma262/#sec-well-known-symbols)
- [ECMA-262: Proxy Objects](https://tc39.es/ecma262/#sec-proxy-objects)
- [ECMA-262: Reflect](https://tc39.es/ecma262/#sec-reflect-object)
- [ECMA-262: JSON.parse](https://tc39.es/ecma262/#sec-json.parse)
- [HTML: Safe passing of structured data](https://html.spec.whatwg.org/multipage/structured-data.html)
