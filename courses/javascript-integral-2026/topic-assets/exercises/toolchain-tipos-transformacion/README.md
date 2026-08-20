# 8.3 — Toolchain, tipos y transformación de código

## Por qué una build no es una caja negra

Escribir `pnpm build` no convierte el código en correcto ni hace que el runtime entienda cualquier sintaxis. Una **toolchain** es una cadena de contratos: formatter, linter, verificador de tipos, transformador, bundler y debugger miran el mismo programa desde ángulos distintos. Si falla uno, primero preguntá qué artefacto recibió, qué artefacto produjo y en qué runtime se ejecuta. Esa traza corta evita discutir si “TypeScript lo arregla” o si “el bundle rompió todo”.

En este capítulo vas a separar formato de semántica, compilación de bundling, borrado seguro de código de minificación, fuente de artefacto generado y chequeo estático de validación de runtime. Después vas a modelar un codemod pequeño como lo hacen las herramientas reales: parsear texto a AST, transformar nodos y generar texto nuevo. No se instala ninguna dependencia: Node ejecuta el laboratorio y el AST está explícitamente reducido para que se vea el contrato.

## Formato, lint y convenciones

Un formatter aplica una representación estable: espacios, comas, saltos y ancho de línea. Prettier no decide si una comparación está invertida; hace que esa comparación deje de ser una discusión de estilo. Corré `pnpm format:check` en CI y `pnpm format` sólo cuando querés reescribir archivos. No formatees output generado ni mezcles un reformat masivo con un cambio de comportamiento: el diff deja de mostrar la causa.

Un linter analiza patrones que suelen ser errores o decisiones costosas: variables sin usar, `await` olvidado, APIs peligrosas o convenciones propias. ESLint puede parsear JavaScript y TypeScript, pero una regla no reemplaza entender la semántica. Una excepción de lint debe explicar una condición concreta; apagar una regla de archivo entero para silenciar una línea borra señal futura.

La convención útil es automática y verificable. En este repositorio, los comandos relevantes son:

```sh
pnpm format:check
pnpm lint
pnpm build
```

El orden no convierte los pasos en una dependencia técnica rígida: format y lint suelen poder correr en paralelo. Lo importante es que todos usen la misma configuración versionada y que CI falle antes de publicar un artefacto inválido.

## Transpilar, bundle, tree shaking y minificar

**Transpilar** transforma una fuente a otra con semántica equivalente para el target elegido. TypeScript elimina tipos y puede bajar sintaxis; Babel u otra herramienta también puede reescribir sintaxis. Esto responde “¿qué entiende el runtime objetivo?”, no “¿qué archivos entrega la aplicación?”. Un `.ts` no corre directamente en Node sólo por existir `tsc`; hace falta un loader explícito o ejecutar el JavaScript emitido.

Un **bundler** sigue el grafo desde uno o más entry points, resuelve imports y emite archivos de entrega. Puede dejar módulos separados, repartir chunks o reunirlos. Node con ESM puede resolver módulos sin bundlear; el bundle es una decisión de entrega, rendimiento y compatibilidad, no una propiedad de JavaScript.

**Tree shaking** intenta eliminar exports que no son alcanzables desde los entry points. Funciona mejor con imports/export estáticos y módulos que declaran fielmente sus efectos. Este módulo no es descartable aunque su export no se use:

```js
registrarPlugin(globalThis.catalogo);
export const version = '1';
```

Si una configuración marca ese archivo como libre de efectos, el bundler puede quitar una inicialización observable. No agregues `sideEffects: false` por tamaño sin auditar imports y tests de integración. Un export puro sí ofrece una oportunidad real:

```js
export function sumar(a, b) {
  return a + b;
}
```

**Minificar** reduce el tamaño del texto emitido: compacta espacios, acorta nombres locales o pliega expresiones sólo cuando puede preservar semántica. No cambia el contrato del programa; si lo hace, es un bug o una suposición inválida sobre efectos. Medí gzip/brotli y tiempo de parseo antes de agregar un paso nuevo. En desarrollo priorizá trazas y rebuilds legibles; en producción, optimizá el artefacto que realmente se sirve.

### Una transformación no es siempre semánticamente neutra

“Transformar” sólo significa que entra un programa y sale otro; no garantiza que ambos hagan lo mismo. Un formatter intenta conservar el árbol sintáctico. Un transpiler debe preservar el comportamiento definido para el target, pero puede necesitar helpers, cambiar el orden visible de ciertas inicializaciones o no poder representar una característica sin una política adicional. Por ejemplo, bajar `async` a un runtime sin soporte introduce una máquina de estados y depende de cómo se provean Promises. Elegir un target no es una preferencia estética: es declarar qué sintaxis y APIs puede asumir el artefacto.

También distinguí eliminar código de demostrar que ese código no importa. Un `if (false) { ... }` puede ser inalcanzable para un minifier; un export no importado puede ser candidato para tree shaking. En cambio, una llamada, un getter, un `await`, una lectura de variable global o una asignación pueden observarse desde afuera. El optimizador no puede borrarlos con seguridad sólo porque su resultado no se guarde. Una configuración que reemplaza una constante de build permite que el bundler vea una rama, pero si el valor se decide en runtime la rama sigue siendo necesaria.

```js
if (import.meta.env.DEV) conectarInspector();
```

Esta rama puede desaparecer de una build si la herramienta reemplaza `import.meta.env.DEV` por `false` durante la compilación. `if (proceso.env.MODO === 'dev')` no necesariamente puede eliminarse: depende de si el bundler conoce y sustituye ese valor. No confundas “mi herramienta lo hizo en este proyecto” con una regla del lenguaje. Revisá el output y conservá una prueba del efecto que te importa.

Los side effects no son una marca moral de “código malo”: registrar un custom element, instalar un listener, llenar un registro de plugins o aplicar un polyfill son efectos legítimos. El problema aparece cuando la metadata promete ausencia de efectos y el módulo los tiene, o cuando un módulo parece puro pero su import dispara una inicialización. Separar `registrar()` de `utilidades.js` suele dar un grafo más claro que silenciar al bundler con una excepción global.

## Source maps, stack traces e inspector

El runtime ejecuta `dist/app.js`, no necesariamente `src/app.ts`. Un **source map** relaciona una posición generada —línea, columna y nombre— con la fuente original. Cuando un stack trace dice `app.js:1:8421`, el inspector puede presentar `src/pagos.ts:27` si el mapa corresponde exactamente a ese build.

```sh
node --inspect-brk dist/app.js
```

Ese comando pausa antes de ejecutar y permite conectar el inspector de Node. Poné un breakpoint, revisá el call stack y verificá qué archivo se cargó. No arregles un bug editando `dist/`: el siguiente build sobrescribe esa edición. Reproducilo, volvé desde el artefacto a la fuente mediante el mapa y corregí la fuente.

Los maps también son un límite de seguridad. Según cómo se publiquen, pueden incluir rutas internas y `sourcesContent`. Una aplicación pública no debería exponerlos por costumbre: definí quién los necesita, si se suben al servicio de errores y si se sirven al navegador. Un mapa faltante dificulta depurar; un mapa de otra versión miente. Conservá la pareja artefacto/mapa bajo el mismo identificador de release.

## Tipos opcionales: JSDoc y TypeScript

JavaScript sigue siendo dinámico. JSDoc puede describir contratos al lado de un `.js` y TypeScript puede revisarlos con `checkJs`; `allowJs` incluye JavaScript en la compilación. Es una adopción gradual útil cuando no querés convertir cada archivo a `.ts`:

```js
/** @param {number} subtotal @param {number} iva @returns {number} */
export function total(subtotal, iva) {
  return subtotal * (1 + iva);
}
```

Con TypeScript podés declarar el contrato en la firma:

```ts
export function total(subtotal: number, iva: number): number {
  return subtotal * (1 + iva);
}
```

Ambas opciones detectan que `total('100', 0.21)` contradice el tipo conocido. Ninguna valida JSON entrante: después de `await response.json()`, el valor sigue siendo desconocido hasta que comprobás su forma en runtime. Usá tipos para diseñar y revisar el código; usá validación en la frontera para no confiar en la red, entorno, archivos o usuarios.

No migres a TypeScript por reflejo. Elegí JSDoc cuando el JavaScript existente ya es claro y necesitás señal gradual; elegí TypeScript cuando los tipos compartidos, refactors y APIs complejas compensen el paso de compilación. En ambos casos, no uses `any` o casts para apagar un error que está señalando una frontera sin validar.

Un type checker tampoco ejecuta el programa ni conoce todas sus rutas. Puede inferir que una función devuelve `string`, pero no sabe que un feature flag remoto cambiará mañana ni que un servicio externo cumplirá su documentación. Las aserciones de tipo (`as Usuario`) son una promesa del autor al checker, no una conversión ni una comprobación. Preferí `unknown` para un valor externo y una función pequeña que valide lo que el producto realmente necesita antes de usarlo. Así el tipo refinado queda después de una evidencia de runtime, no antes.

JSDoc y TypeScript comparten ese límite, aunque su ergonomía sea distinta. JSDoc es comentario con significado para herramientas: puede degradarse si otro editor no lo comprueba y algunas expresiones de tipos complejas se vuelven ruidosas. TypeScript añade sintaxis, declaraciones y un compilador, pero sus tipos desaparecen del JavaScript emitido. Ninguno convierte una fecha serializada en `Date`, verifica permisos ni impide que un `Map` mutado por otra parte cambie entre dos líneas. Mantené las invariantes críticas en tests y validaciones; usá el tipo para que el camino correcto sea fácil de expresar.

## Parsear, transformar y generar

Una regex puede reemplazar `debug` dentro de un string, comentario o propiedad sin saber qué significa. Una herramienta de transformación trabaja con estructura:

```text
fuente → parser → AST → codemod → AST nuevo → code generator → fuente emitida
```

Un **AST** representa sintaxis como nodos. Por ejemplo, `debug(value);` puede ser un `Program` con un `ExpressionStatement`, cuyo `CallExpression` tiene identificadores `debug` y `value`. El parser entiende gramática; el codemod selecciona y reemplaza nodos; el generador emite JavaScript válido otra vez. Babel, TypeScript y herramientas de codemods aplican esta idea, aunque sus AST y opciones sean mucho más completos.

Renombrar un identificador real exige resolver scopes y bindings. `debug` puede ser una variable local, un import o una propiedad con otro significado. El laboratorio no finge resolver eso: admite sólo cuatro nodos, falla ante cualquier otro y no muta el input. Además, sólo acepta identificadores ASCII con la forma `^[A-Za-z_$][A-Za-z0-9_$]*$` y rechaza keywords, literales, `await` y `yield` antes de emitir JavaScript. No modela Unicode escapes ni resolución completa de scope; ese límite explícito es mejor que una regex que “funciona” hasta encontrar un comentario.

Un **scope** define qué bindings son visibles en una posición. Un codemod que renombra el import `logger` tiene que distinguirlo de `function f(logger) {}`: ese parámetro crea un binding nuevo y no debe cambiarse por accidente. También tiene que considerar shadowing, destructuring, catch bindings, clases y el binding de una propiedad. `obj.logger` no equivale a la variable `logger`; modificar uno no implica modificar el otro. Los parsers suelen ofrecer rangos y comentarios, y las herramientas de scope enlazan cada uso con su declaración. Esa relación, no el texto del nombre, permite una transformación confiable.

El code generator tampoco es un `join` inocente. Debe emitir paréntesis y precedencia correctos, conservar o reconstruir comentarios según su contrato y producir un source map que apunte desde el código generado al original. Si cambiás el AST, el mapa anterior ya no corresponde: generá uno nuevo como parte del mismo build. Una transformación que se ve bien en un diff puede romper por una coma, una precedence o un comentario directivo mal ubicado; por eso una fixture que ejecuta el output complementa la comparación textual.

No escribas codemods para un archivo a mano y ejecutes el resultado sin revisar. Agregá una fixture mínima por caso, imprimí o compará el output, corré tests y dejá el codemod idempotente cuando sea posible. Para una migración grande, medí cuántos nodos cambió y preservá un rollback: fuente original en control de versiones, nunca el bundle como fuente de verdad.

## Laboratorio guiado

En `starter.mjs` implementá tres funciones. `buildPlan` recibe `{ entry, mode, typeCheck }` y devuelve el pipeline explícito: en desarrollo agrega `source-map`; en producción agrega `tree-shake` y `minify`. No invoca bundlers ficticios: modela su contrato. `renameIdentifier` recibe un AST mínimo y devuelve otro sin mutar el original. `generate` vuelve ese AST a texto JavaScript.

```sh
node starter.mjs   # RED hasta implementar
node solution.mjs  # referencia y GREEN
```

Pista 1: validar `mode` evita que “test” parezca una build soportada. Pista 2: usá un `switch` por `node.type`; rechazar un nodo desconocido es más seguro que generar código incompleto. Pista 3: el output de un codemod no prueba que las bindings sean correctas: el AST reducido no implementa análisis de scope. Está terminado cuando pasan los asserts de pipeline, tipos opcionales, producción, no mutación, generación e inputs inválidos.

## Recuperación y transferencia

Sin ejecutar, resolvé estas cinco recuperaciones.

1. ¿Qué problema resuelve transpilar que bundlear no resuelve?
2. ¿Cuándo tree shaking puede borrar comportamiento y qué side effect lo impide?
3. ¿Qué posición conecta un source map y qué versión debe coincidir para depurar?
4. ¿Por qué un tipo no valida `response.json()` y qué hace una aserción `as` en runtime?
5. ¿Qué información de scope/binding tiene un AST que una regex no tiene?

Hacé dos transferencias. Primero, ante un error en producción, anotá entry point, artefacto desplegado, versión del source map y runtime; recién entonces abrí el inspector y proponé el arreglo en fuente. Segundo, elegí un reemplazo de API de tu código y escribí si una regex puede hacerlo: identificá declaración, usos, shadowing y propiedades antes de elegir parser/codemod/generador.

En V2 empezá con el diagnóstico socrático: predecí qué pasos estarán en el plan de desarrollo y producción, y dibujá el AST de una llamada antes de correr el laboratorio. Si confundiste minificación con transpiling, corregí la predicción nombrando entrada, transformación y salida de cada paso. La práctica observada, el feedback y una recuperación espaciada pueden aportar evidencia; mastery se deriva de esa evidencia, no de leer este README. En 48 horas, sin apuntes, explicá por qué una migración de API necesita parser, scope y generador, y qué maps publicarías para una release con información sensible.

## Referencias primarias

- [ECMA-262: ECMAScript modules](https://tc39.es/ecma262/#sec-modules)
- [Node.js: debugger](https://nodejs.org/api/debugger.html)
- [Node.js: command-line API (`--inspect`)](https://nodejs.org/api/cli.html#--inspecthostport)
- [TypeScript: JSDoc reference](https://www.typescriptlang.org/docs/handbook/jsdoc-supported-types.html)
- [TypeScript: `checkJs`](https://www.typescriptlang.org/tsconfig/checkJs.html)
- [Source Map Revision 3 proposal](https://sourcemaps.info/spec.html)
- [Babel: parser](https://babeljs.io/docs/babel-parser)
