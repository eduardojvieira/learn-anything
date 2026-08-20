# Contrato editorial del curso

Los capítulos `1.1`, `1.2` y `1.3` son la referencia canónica. Cada capítulo nuevo debe sentirse escrito por la misma persona: español rioplatense claro, segunda persona, precisión antes que jerga y progresión de una intuición concreta a los bordes avanzados.

## Entregables

Cada concepto ocupa exactamente cuatro archivos:

- `topic-assets/exercises/<slug>/README.md`
- `topic-assets/exercises/<slug>/starter.mjs`
- `topic-assets/exercises/<slug>/solution.mjs`
- `topic-assets/quizzes/<slug>/quiz.json`

## Piso de contenido

- `README.md`: entre 1.800 y 2.600 palabras útiles, sin relleno ni párrafos reutilizados.
- Título humano numerado, intuición inicial y una sección sustancial por cada punto exacto del programa.
- De cuatro a cinco ejemplos específicos y ejecutables, con salida o traza verificable.
- Errores frecuentes, límites, compatibilidad y decisiones de diseño cuando correspondan.
- Laboratorio guiado con contrato observable, tres pistas graduadas y definición de terminado.
- Cinco preguntas de recuperación, dos tareas de transferencia y una evaluación nueva para 48 horas después.
- Integración explícita con diagnóstico socrático, autoexplicación, feedback/corrección, evidencia y mastery derivado de V2. Nunca inventar sesiones, evidencia ni dominio.
- Referencias primarias directas. Toda capacidad dependiente del runtime debe usar feature detection y quedar descripta como tal.

## Código y evaluación

- `starter.mjs` debe importar `node:assert/strict`, contener TODO reales, pasar `node --check` y fallar al ejecutarse antes de completar el trabajo.
- `solution.mjs` debe ser legible, determinista, sin dependencias nuevas, cubrir bordes con asserts y terminar con código 0.
- `quiz.json` debe seguir el esquema de `sintaxis-valores-tipos-bindings/quiz.json`: exactamente cinco preguntas específicas del capítulo, distractores plausibles y explicaciones sustantivas. `concept_name` siempre es el título humano, no el slug.
- Formatear los cuatro archivos con Prettier y ejecutar el validador de quiz del repositorio.
- Antes de renderizar, ejecutar el gate público `learnctl validate-course <topic-dir>`: valida la correspondencia de estado, README, starter/solution y quiz; no ejecuta laboratorios. Los laboratorios JS siguen usando `.mjs` y se verifican aparte con Node.

## Investigación

Preferir ECMA-262, ECMA-402, TC39, WHATWG, MDN sólo como apoyo, Node.js, npm, W3C/WAI, WebAssembly y documentación oficial del proyecto pertinente. Si una API o versión es incierta, usar Context7 para documentación versionada. Para búsqueda, extracción o contraste más amplio, delegar a un scout con Tavily. No afirmar como universal una propuesta o capacidad que dependa del runtime.

## Control de homogeneidad

Antes de entregar, comparar estructura, densidad, tono, tipos de ejemplos y cierre pedagógico contra `1.2` y `1.3`. Si un párrafo podría copiarse sin cambios a otro capítulo, todavía es demasiado genérico.
