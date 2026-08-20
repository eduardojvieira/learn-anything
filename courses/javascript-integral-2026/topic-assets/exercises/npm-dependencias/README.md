# 8.2 — npm, package.json y cadena de dependencias

## Instalar no es copiar una carpeta

Cuando escribís `npm install`, no elegís un archivo aislado: pedís que npm construya un árbol de paquetes compatible con tu manifest, sus dependencias transitivas, las reglas de semver y el registro configurado. Si una actualización “sin cambios propios” rompe producción, el dato relevante no es sólo qué versión declaraste: importa qué grafo se resolvió, qué lockfile se usó, qué scripts corrieron y desde dónde llegó cada artefacto.

Este capítulo requiere 8.1. La meta es convertir una lista de dependencias en un contrato revisable: decidir rangos, congelar instalaciones para CI, tratar scripts como código ejecutable y reducir —sin prometer eliminar— el riesgo de supply chain.

## Semver expresa compatibilidad, no confianza

Una versión semántica tiene forma `MAJOR.MINOR.PATCH`. En la convención, PATCH corrige bugs compatibles, MINOR agrega funcionalidad compatible y MAJOR puede romper la API. Es una promesa del autor; npm la usa para resolver, pero no puede probar que la promesa sea cierta ni que un paquete sea seguro.

En `package.json`, `dependencies` declara lo necesario en runtime y `devDependencies` lo necesario para desarrollar, testear o construir. Esa separación no vuelve inocuo a un devDependency: también puede ejecutar scripts durante una instalación o entrar al pipeline de build. Elegí la sección por el consumidor final, no por cuán popular te parezca la librería.

```json
{
  "dependencies": { "api-client": "^2.4.1" },
  "devDependencies": { "test-runner": "~3.2.4" }
}
```

`^2.4.1` permite `>=2.4.1 <3.0.0`; `~3.2.4` permite `>=3.2.4 <3.3.0`. Para `0.x`, caret es más estrecho: `^0.4.1` llega hasta antes de `0.5.0`, y `^0.0.4` hasta antes de `0.0.5`. No memorices una superstición sobre “caret siempre actualiza minor”: calculá el primer componente no cero que protege la compatibilidad.

```js
console.log('^2.4.1:', '2.8.0 acepta', '3.0.0 rechaza');
console.log('^0.4.1:', '0.4.9 acepta', '0.5.0 rechaza');
// ^2.4.1: 2.8.0 acepta 3.0.0 rechaza
// ^0.4.1: 0.4.9 acepta 0.5.0 rechaza
```

Un rango exacto, por ejemplo `2.4.1`, sólo admite esa versión. Un rango puede ser una política razonable para una librería consumida por muchas apps; no equivale a “siempre instalar lo último”. En una aplicación desplegada, un rango amplio sin lockfile deja que dos instalaciones en fechas distintas resuelvan distinto. Pre-releases, tags como `latest`, aliases, URLs, git y rangos compuestos existen en npm, pero no los confundas con semver simple: cambian la política de actualización y deben documentarse.

El laboratorio modela componentes con Number por simplicidad, así que acepta sólo enteros seguros. No intenta representar un major mayor que Number.MAX_SAFE_INTEGER: dos enteros grandes pueden redondearse al mismo Number y una comparación dejaría de distinguir versiones distintas. También rechaza un caret cuyo componente a incrementar sea MAX_SAFE_INTEGER; producir un límite superior redondeado sería mentir sobre el rango. npm no usa este ejercicio como resolvedor: para rangos reales, prereleases y valores grandes confiá en npm y en su lockfile.

## El grafo que realmente corre

Tu dependencia directa puede pedir cinco transitivas; dos paquetes pueden pedir versiones incompatibles de una tercera. npm resuelve un árbol que satisface los rangos cuando puede, y puede ubicar copias en posiciones diferentes del árbol. El resultado no se deduce mirando sólo la raíz. Los peer dependencies añaden otra restricción: expresan que un paquete debe compartir una dependencia con su consumidor. Ignorar un conflicto de peer no es una reparación; puede dejar una combinación que nunca fue probada.

Usá evidencia local para mirar el resultado:

```sh
npm ls --all
npm explain una-dependencia
```

`npm ls --all` muestra el árbol instalado; `npm explain` indica qué ruta lo trajo. La salida depende de tu proyecto, por eso no copies una traza ajena como diagnóstico. Guardá el comando, el lockfile y la versión de Node/npm que produjo el resultado. El grafo también puede variar por plataforma, opcionales y condiciones de instalación.

El comando `npm dedupe` puede reorganizar paquetes si conserva las restricciones, pero no es una limpieza obligatoria ni una respuesta a una vulnerabilidad. Antes de modificar el lockfile, revisá el diff: una reducción de carpetas no demuestra compatibilidad, y una actualización indirecta puede ser un cambio de runtime.

## Manifest, lockfile y una instalación repetible

`package.json` describe intención aceptable; `package-lock.json` registra las versiones concretas, URLs de resolución e integridad que npm resolvió para ese proyecto. Si el lock satisface el manifest, `npm install` lo usa; si no, vuelve a resolver y actualiza el lock. Versioná ambos para aplicaciones y para repositorios que necesitan builds reproducibles.

```sh
git clean -xfd
npm ci
npm test
```

En una copia descartable de CI, `npm ci` requiere un lockfile, elimina `node_modules` existente, instala desde el lock y no modifica `package.json` ni el lockfile. Si manifest y lock no son compatibles, falla. Ese fallo evita que CI “arregle” silenciosamente un árbol que alguien olvidó versionar.

El lockfile reduce variación; no congela el mundo. No fija Node, npm, el sistema operativo, un registry alternativo, secretos, flags de instalación ni el comportamiento de scripts. Si el lock fue generado con opciones como `--legacy-peer-deps` o `--install-links`, `npm ci` necesita la misma configuración. Compartí esa decisión en un `.npmrc` versionado cuando corresponda, y fijá el runtime en CI. Nunca agregues tokens al repositorio.

La integridad del lock verifica que el tarball descargado coincide con el contenido esperado para esa resolución; no certifica intención benigna. Un lockfile comprometido, una versión legítima con bug o una acción de instalación con permisos excesivos siguen siendo riesgos distintos.

## Scripts y lifecycle hooks: código con oportunidad de ejecución

Los scripts de `package.json` dan nombres estables a tareas del proyecto:

```json
{
  "scripts": {
    "test": "node --test",
    "check": "npm run test && npm run lint",
    "prepare": "node scripts/build.mjs"
  }
}
```

```sh
npm run check
```

Eso corre `test` y, sólo si termina bien, `lint`; la traza esperada es la salida de ambos comandos en ese orden. npm agrega `node_modules/.bin` al PATH del script, por eso no hace falta una ruta larga a una herramienta local. Evitá esconder lógica sustantiva en una cadena de shell opaca: un script debe ser fácil de leer, ejecutar y revisar.

Los lifecycle hooks son especialmente sensibles. Al publicar, npm ejecuta en orden `prepublishOnly`, `prepack`, `prepare`, `postpack`, `publish` y `postpublish`. Otros comandos también pueden disparar hooks. No asumas que un script es “sólo configuración”: puede leer archivos, usar red o modificar el árbol según los permisos del proceso. Revisá scripts propios y de dependencias en actualizaciones de alto impacto; en una investigación, `--ignore-scripts` puede aislar la instalación, pero no sustituye ejecutar el build y tests normales antes de aceptar el cambio.

## Workspaces: un repositorio, límites explícitos

Un root puede declarar paquetes locales:

```json
{
  "private": true,
  "workspaces": ["packages/*"],
  "scripts": { "test": "npm run test --workspaces --if-present" }
}
```

```sh
npm run test --workspace=@acme/api
npm run test --workspaces --if-present
```

El primer comando apunta a un workspace; el segundo recorre los que tengan `test`. `--if-present` no vuelve exitoso un test fallido: sólo omite el paquete que no declaró ese nombre. Mantené el root `private: true` si es un coordinador que no debe llegar al registro, y no uses workspaces como excusa para compartir dependencias sin dueños claros. Cada paquete debe declarar lo que necesita como consumidor.

## Publicar con identidad verificable

Antes de publicar, inspeccioná lo que se empaqueta:

```sh
npm pack --dry-run
```

La lista resultante revela archivos incluidos, no una garantía de que el paquete sea correcto. Revisá `files`, `.npmignore`, secretos, fuentes, artefactos generados y el contenido que realmente consumirán otros. Definí tag, acceso y versionado deliberadamente; un nombre y una versión publicados son parte de tu API de distribución.

Para CI compatible, trusted publishing usa identidad OIDC de un proveedor configurado en npm en lugar de guardar un token de publicación de larga vida. npm puede asociar provenance al paquete: una attestation que vincula el artefacto con un workflow y su origen. Configurá permisos mínimos del workflow y protegé la rama o tag que puede liberar versiones. La capacidad depende del proveedor y de la configuración del registry; verificá el soporte actual antes de diseñar el pipeline.

Usá 2FA para la cuenta, preferentemente el modo que exige segundo factor también al publicar y cambiar tags o acceso. 2FA reduce el daño de una contraseña robada, pero no protege por sí sola un workflow comprometido, una sesión robada o un maintainer con permisos indebidos. Separá quién escribe código, quién aprueba y quién puede liberar cuando el riesgo del paquete lo justifique.

## Audit, firmas y límites de la defensa

```sh
npm audit
npm audit signatures
```

`npm audit` consulta avisos conocidos contra el árbol resuelto. `npm audit signatures` verifica firmas del registry y attestations de provenance cuando el cliente y los paquetes las soportan. Una salida limpia significa “no hubo hallazgos aplicables en esa fuente ahora”, no “el software es seguro”. No ejecutes `npm audit fix --force` como reflejo: puede cambiar majors, peers o el lockfile sin resolver la causa de exposición.

Una defensa práctica combina: mínimo de dependencias, revisión de mantenedores y releases, lockfile revisado, CI con `npm ci`, permisos mínimos, secretos fuera del repo, 2FA, trusted publishing donde aplique, revisión del tarball y monitoreo de avisos. También definí respuesta: qué paquete se bloquea, cómo se revierte una versión y quién comunica la actualización. Ninguna firma, audit o provenance elimina typosquatting, código malicioso publicado por un maintainer legítimo, vulnerabilidades desconocidas ni una cadena de build comprometida.

Errores frecuentes: tratar `latest` como baseline; borrar el lock para “destrabar”; poner una dependencia runtime en devDependencies; aceptar un hook sin leerlo; confundir `npm ci` con una actualización; y asumir que provenance es un sello de calidad. El límite correcto es explícito: estas herramientas aportan trazabilidad y controles, no certeza absoluta.

## Laboratorio y sesión V2

En `starter.mjs` implementá tres funciones. `caretUpperBound` acepta sólo caret de tres Number enteros seguros y calcula su límite exclusivo, incluidos los bordes `0.x`; rechaza el incremento de MAX_SAFE_INTEGER. `lockSatisfies` compara un lock con un rango exacto o caret limitado del laboratorio y rechaza componentes inseguros antes de que puedan redondearse. `releasePlan` no publica nada: valida que CI tenga lock compatible y que una liberación exija 2FA y trusted publishing. El alcance deliberado no cubre prereleases, tags ni todos los rangos npm; para producción usá el resolvedor de npm, no este ejercicio.

Pista 1: parseá `major.minor.patch` una sola vez, rechazá ceros con formato ambiguo y verificá Number.isSafeInteger. Pista 2: compará cada componente de izquierda a derecha; un caret tiene límite inferior inclusivo y superior exclusivo, pero no incrementes MAX_SAFE_INTEGER. Pista 3: validá que los cuatro flags sean booleanos antes de decidir; no conviertas strings como `"false"`.

Está terminado cuando `node starter.mjs` deja de fallar, `node solution.mjs` cubre exactos, `^2`, `^0.4`, `^0.0`, componentes inseguros, el borde MAX_SAFE_INTEGER, entradas inválidas y cada control faltante, y podés explicar por qué un lock reproducible no prueba seguridad. No reemplaces asserts por logs.

Para recuperación, respondé sin mirar: (1) ¿qué diferencia hay entre manifest y lockfile? (2) ¿qué cambia caret bajo 1.0? (3) ¿por qué un peer conflict merece investigación? (4) ¿qué hace `npm ci` que no debe hacer `npm install` en CI? (5) ¿qué verifican y qué no verifican firmas/provenance?

Transferí el modelo a dos casos: armá una política de actualización mensual para una app con dependencias transitivas críticas; y diseñá un workspace con una librería pública y una app privada, indicando quién puede liberar cada paquete. En Learn Anything V2 iniciá `study`, respondé el diagnóstico socrático y registrá tu razonamiento. El feedback y la corrección se guardan sólo si la sesión ocurre; la evidencia observada alimenta mastery, spacing e interleaving. Leer este capítulo no fabrica evidencia ni dominio.

En 48 horas, resolvé un caso nuevo: CI falla porque el lock no satisface un rango modificado y una dependencia transitiva tiene un advisory. Decidí qué diff revisarías, qué comando usarías, si aceptarías o revertirías el cambio y qué límite siguen teniendo audit y provenance antes de consultar apuntes.

## Referencias primarias

- [npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)
- [npm semver](https://docs.npmjs.com/cli/v11/using-npm/semver)
- [npm install y package-lock](https://docs.npmjs.com/cli/v11/commands/npm-install)
- [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci)
- [npm scripts y lifecycle](https://docs.npmjs.com/cli/v11/using-npm/scripts)
- [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces)
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers)
- [npm audit y firmas](https://docs.npmjs.com/cli/v11/commands/npm-audit)
- [npm 2FA](https://docs.npmjs.com/cli/v11/commands/npm-profile)
