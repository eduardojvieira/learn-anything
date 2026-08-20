# 8.1 — ES modules, CommonJS y resolución

## Un `import` no abre un archivo: pide un módulo al host

`import { total } from './saldo.mjs'` mezcla dos capas. ECMAScript define módulos, bindings, instanciación y evaluación. El host decide qué significa el specifier, dónde buscarlo y qué tipo de módulo cargar. Node resuelve paquetes, extensiones y `package.json`; un navegador resuelve URLs e import maps. No atribuyas una regla de Node al lenguaje ni supongas que una URL del navegador conoce `node_modules`.

En este capítulo vas a seguir un grafo de módulos sin confundir orden de carga con copia de valores; elegir entre ESM y CommonJS sin duplicar estado; y diagnosticar una resolución fallida desde el host correcto. Un módulo es una frontera de nombres y evaluación, no un mecanismo de seguridad ni un gestor de dependencias por sí solo.

## Exportar bindings e importar bindings vivos

ESM exporta bindings, no snapshots. El exportador conserva el único binding que puede reasignar; un importador lo observa y no puede escribirlo. Eso vuelve visible una actualización hecha por una función del módulo:

```js
// saldo.mjs
export let saldo = 0;
export function acreditar(monto) {
  saldo += monto;
}

// reporte.mjs
import { acreditar, saldo } from './saldo.mjs';
acreditar(5);
console.log(saldo); // 5
// saldo = 0; // SyntaxError: un import no se reasigna
```

`export default` exporta un valor bajo el nombre `default`; no es una categoría de módulo ni hace especiales sus propiedades. `export { nombre as otroNombre }` vuelve explícita una API pública. Preferí exports nombrados cuando haya varios conceptos estables; un default puede servir para el valor principal de un módulo. Reexportar (`export { format } from './format.mjs'`) compone la superficie pública sin ejecutar una copia local.

Un binding vivo no vuelve inmutable lo que referencia. Si exportás `const config = { modo: 'lectura' }`, `config` no se reasigna, pero el objeto puede mutar si alguien recibe esa referencia. Definí quién puede mutar y exponé operaciones antes de usar un objeto exportado como estado global compartido.

## Instanciar primero, evaluar después

Para un grafo ESM, el motor primero enlaza módulos: crea bindings y conecta imports con exports. Después evalúa los cuerpos, respetando dependencias. Por eso una función importada puede existir antes de que todos los cuerpos terminen, pero leer un `let` o `const` exportado antes de inicializarlo cae en TDZ.

```js
// a.mjs
import { leerB } from './b.mjs';
export const a = 'A';
console.log(leerB());

// b.mjs
import { a } from './a.mjs';
export function leerB() {
  return a;
}
```

Este ciclo funciona porque `b` no lee `a` durante su evaluación: sólo crea una función que la leerá después de que `a` se inicialice. Si `b.mjs` hiciera `export const visto = a` en su cuerpo, la lectura temprana lanzaría `ReferenceError`. El arreglo no es agregar `setTimeout` al azar: rompé la dependencia, retrasá la lectura hasta que el contrato lo permita o mové el estado a un tercer módulo.

La evaluación de cada módulo normal se comparte por grafo y por identidad de módulo del host: dos imports del mismo módulo no reinician sus side effects. No conviertas ese cache en un detalle oculto; un módulo con efectos al cargar dificulta testear, ordenar arranque y razonar sobre ciclos. Preferí exportar una operación de inicio cuando el efecto necesita un momento explícito.

## `import()` y top-level await cambian cuándo está listo

`import()` es una expresión que devuelve una Promise del namespace del módulo. Sirve para cargar una capacidad bajo demanda o detrás de una condición; no cambia que el host tenga que resolver el specifier.

```js
async function renderizar(formato, valor) {
  const formatos = { ars: './formatos/ars.mjs', iso: './formatos/iso.mjs' };
  const { formatear } = await import(formatos[formato]);
  return formatear(valor);
}
```

No uses un specifier construido desde input externo como si fuera validación: elegí contra una allowlist antes de importar. El módulo dinámico puede rechazar por resolución, parseo o porque su evaluación lanzó; manejá ese rechazo en el borde que sabe qué experiencia dar. La Promise expresa que una carga y evaluación pueden terminar después, aun si el módulo ya estaba en cache.

Un módulo ESM puede usar `await` en el nivel superior. Sus dependientes esperan su evaluación asíncrona; no es una pausa invisible que CommonJS pueda cruzar con `require()`. Usalo para un prerrequisito de arranque realmente necesario. Para trabajo opcional, una función async o `import()` conserva un arranque menos acoplado. Los ciclos que combinan espera y dependencia pueden dejar un grafo sin progreso: diseñá un borde de inicialización único en vez de hacer que módulos de bajo nivel se esperen entre sí.

Los atributos de import describen cómo interpreta el host un recurso. En Node actual, JSON requiere `with { type: 'json' }`:

```js
import catalogo from './catalogo.json' with { type: 'json' };
const { default: otro } = await import('./otro.json', { with: { type: 'json' } });
```

No son una conversión general de archivos ni una forma de saltar CORS o MIME types. Qué atributos admite un host y cómo valida el recurso es parte de ese host. Usar un atributo reconocido no hace confiable un dato: validá su forma en la frontera de dominio.

## Resolución: el lenguaje delega

ECMAScript conserva specifiers como `'./saldo.mjs'` o `'paquete'`; el host los resuelve. En navegador, los relativos se resuelven como URLs contra la URL del módulo. Un import map puede cambiar aliases y paquetes bare antes de esa resolución:

```html
<script type="importmap">
  { "imports": { "fecha": "/assets/fecha-v2.mjs" } }
</script>
<script type="module">
  import { hoy } from 'fecha';
  console.log(hoy());
</script>
```

El import map es configuración del documento, no sintaxis ECMAScript ni una API disponible automáticamente en Node. Un navegador también aplica políticas de red, MIME y CORS. Probá en el servidor y navegador reales antes de diagnosticar una falla como “JavaScript no encuentra el módulo”.

Node decide ESM o CommonJS por extensión (`.mjs`/`.cjs`), por `"type"` en el `package.json` más cercano y por sus reglas de detección. En ESM, los imports relativos y absolutos deben llevar extensión y un índice también se escribe completo: `./util.mjs`, no `./util`. Esa regla se parece al navegador porque ambos usan identificadores tipo URL; no copies la búsqueda histórica de `require` a ESM.

En un paquete Node, `exports` controla qué subpaths son públicos y puede ofrecer entradas distintas según quien carga:

```json
{
  "name": "mi-paquete",
  "type": "module",
  "exports": {
    ".": { "import": "./index.mjs", "require": "./index.cjs" }
  },
  "imports": { "#config": "./src/config.mjs" }
}
```

`exports` se aplica a consumidores: un path no listado deja de ser importable aunque exista en disco. `imports` es para aliases internos que empiezan por `#`. Ambas son reglas de resolución de Node y herramientas compatibles, no exports del lenguaje. Publicá sólo paths que estés dispuesto a soportar; importar `mi-paquete/dist/interno.js` ata al consumidor a un detalle que `exports` puede —y debe— cerrar.

## CommonJS y la frontera de interoperabilidad

CommonJS ejecuta un archivo cuando `require()` lo carga y comparte `module.exports` mediante un cache de Node. `require` es síncrono y la asignación a `module.exports` entrega el valor público:

```js
// contador.cjs
let n = 0;
module.exports = { incrementar: () => ++n };

// uso.cjs
const contador = require('./contador.cjs');
console.log(contador.incrementar()); // 1
```

No mezcles `exports = ...` con `module.exports = ...`: `exports` empieza como referencia auxiliar; reasignarlo no cambia el valor expuesto. Para compatibilidad, elegí una forma por archivo y no escondas inicialización mutable en dos módulos, porque ESM y CommonJS tienen caches y ciclos con modelos distintos.

Desde ESM, Node permite importar CommonJS: el default representa `module.exports`. Node puede intentar detectar nombres para `import { nombre }`, pero esa detección es estática y los named exports copiados no son bindings vivos. Si el contrato importa, usá el default:

```js
import contador from './contador.cjs';
contador.incrementar();
```

Desde CommonJS, `require()` no es una vía general para cargar un ESM con top-level await. Cuando necesitás ESM desde CommonJS, `import()` devuelve la Promise que expresa la frontera asíncrona. Un ESM que necesita `require` para una dependencia CommonJS puede crearlo explícitamente con `createRequire(import.meta.url)`. No agregues un transpiler sólo para ocultar esta decisión: definí primero si la API pública es sync o async y elegí un formato coherente.

### Diagnóstico por capas

Cuando un módulo no carga, no empieces cambiando comillas o agregando extensiones a ciegas. Primero identificá el host y el formato del archivo que ejecuta la entrada. Después escribí el specifier exacto y preguntá si es relativo, absoluto, bare o un alias. En Node, revisá la extensión, el `type` efectivo y el `exports` del paquete antes de mirar el filesystem; un archivo existente puede estar cerrado por contrato. En navegador, mirá la URL final, el import map que se aplicó y la respuesta de red, incluido su MIME y política CORS.

Recién después separá resolución de evaluación. Un `ERR_MODULE_NOT_FOUND` o un error de paquete exportado apunta a que el host no produjo un módulo. Un `SyntaxError`, `ReferenceError` por TDZ o una Promise rechazada tras resolver apunta al código del módulo o a su grafo. Esta clasificación evita convertir una incompatibilidad ESM/CommonJS en un “problema de import” genérico. Registrá el runtime, versión, comando y specifier mínimo que reproduce la falla; el texto completo del error puede variar, pero esa evidencia permite revisar la capa correcta.

## Laboratorio y aprendizaje real

En `starter.mjs`, implementá `createLedger`, `loadFormatter` y `resolvePublicEntry`. `createLedger` es estado encapsulado por closure: devuelve `credit`, `read` y `snapshot`; `snapshot` devuelve un valor, no una referencia mutable. El binding vivo ESM ya está cubierto por el ejemplo real de `saldo.mjs` y `reporte.mjs` de arriba. `credit` debe calcular el próximo saldo, rechazarlo si no es finito y no mutar el saldo anterior en ese caso. `loadFormatter` acepta únicamente `'plain'` o `'ars'`, carga el formato simulado de manera asíncrona y propaga el rechazo para un formato no permitido. `resolvePublicEntry` muestra una tabla de `exports`: resuelve sólo `'.'` y `'./format'` para `'import'` o `'require'`; un subpath privado debe fallar.

Empezá por `node starter.mjs`: está RED. Validá antes de mutar o resolver; luego hacelo GREEN con `node solution.mjs`. El laboratorio no pretende emular Node, un navegador ni import maps: usa una tabla mínima para hacer observable que una API pública es una allowlist y que la condición de carga pertenece al host. Está terminado cuando los asserts cubren estado por closure, snapshot no compartido, overflow sin mutación, frontera asíncrona, condición y subpath cerrado.

Recuperación: ¿un import ES es copia o binding? ¿qué fase crea los bindings antes de evaluar cuerpos? ¿por qué un ciclo puede leer TDZ? ¿qué devuelve `import()`? ¿quién resuelve un specifier?

En V2, arrancá con diagnóstico socrático: dibujá el grafo de dos módulos antes de ejecutar y señalá qué lectura ocurre durante evaluación. Si confundiste `exports` de `package.json` con `export` de JavaScript, corregí la capa y probá un nuevo specifier. Transferí el modelo a un paquete dual: justificá qué expone `exports` para `import` y `require`, qué alias interno reservarías en `imports`, y por qué el consumidor ESM usa el default al interoperar con CommonJS. Las ejecuciones y correcciones observadas pueden aportar evidencia; leer este texto no declara mastery. Dentro de 48 horas, sin apuntes, explicá por qué `require()` no expresa la espera de un ESM con top-level await y diseñá una superficie pública con un subpath permitido y uno privado.

## Referencias primarias

- [ECMA-262 2026: modules](https://tc39.es/ecma262/2026/multipage/ecmascript-language-scripts-and-modules.html#sec-modules)
- [ECMA-262 2026: imports](https://tc39.es/ecma262/2026/multipage/ecmascript-language-scripts-and-modules.html#sec-imports)
- [ECMA-262 2026: dynamic import](https://tc39.es/ecma262/2026/multipage/ecmascript-language-expressions.html#sec-import-calls)
- [HTML: import maps](https://html.spec.whatwg.org/multipage/webappapis.html#import-maps)
- [Node.js: ECMAScript modules](https://nodejs.org/api/esm.html)
- [Node.js: packages and `exports`](https://nodejs.org/api/packages.html)
