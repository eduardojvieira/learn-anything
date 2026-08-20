# 9.1 — DOM, eventos, formularios y accesibilidad

## Una interfaz no es una colección de clicks

Un botón de “guardar” parece chico hasta que alguien lo usa sólo con teclado, el request tarda, se navega a otra vista y un listener viejo sigue vivo. La plataforma resuelve partes distintas: el DOM representa el documento, los eventos comunican cambios, HTML define controles y restricciones, y el navegador organiza el trabajo visual. Tu tarea no es reemplazar ese sistema con JavaScript; es elegir la capa que ya tiene la semántica correcta y agregar código sólo donde el producto agrega una regla propia.

Este capítulo asume objetos, event loop y módulos. Al terminar deberías poder seguir una interacción desde el nodo hasta el frame, distinguir una limitación del navegador de una regla de negocio y detectar cuándo una optimización o un `div` interactivo le saca capacidades a una persona.

## DOM: árbol, selección y mutación

El **DOM** es la representación de objetos del documento que el host expone a JavaScript; no es el HTML original ni una copia sin costo. `document.querySelector` encuentra el primer nodo de un selector CSS; `querySelectorAll` devuelve una `NodeList` estática. Conservá una referencia sólo mientras tenga dueño claro y preferí `document.createElement` con `textContent` cuando el valor es texto de usuario. `innerHTML` vuelve a parsear markup: no le pases datos no confiables sin una política de sanitización.

```js
const list = document.querySelector('[data-tasks]');
const item = document.createElement('li');
item.textContent = 'Leer la especificación';
list.append(item);
console.log(list.children.length); // 1 más que antes
```

La selección no valida que el nodo exista. Si el script puede correr antes de que se parsee el fragmento, ubicá el script al final de `body`, usá `defer`, o esperá `DOMContentLoaded`; no ocultes un `null` con optional chaining si ese nodo es una precondición. Para muchas filas, evitá alternar lectura geométrica (`offsetHeight`, `getBoundingClientRect`) y escrituras de estilo dentro de un loop: podés forzar layout repetido. Calculá primero, escribí después.

No conviertas cada cambio en una reconstrucción completa de `innerHTML`. Además de perder foco, selección y listeners, el código mezcla datos con markup. Un fragmento chico puede mutarse directamente; cuando hay listas grandes, medí y usá una estrategia que conserve identidades que realmente importan. “Virtualizar” no es gratis: cambia navegación, búsqueda del navegador y semántica si no se diseña con cuidado.

## EventTarget, propagación, delegación y aborting

`EventTarget` es el contrato común de `addEventListener`, `removeEventListener` y `dispatchEvent`. Para un evento que burbujea, el navegador recorre captura desde arriba, ejecuta el target y luego burbujea hacia sus ancestros. `event.target` es donde ocurrió; `event.currentTarget` es el objeto cuyo listener está ejecutándose. `preventDefault()` pide que no ocurra la acción por defecto si el evento es cancelable; `stopPropagation()` detiene el recorrido, por lo que no es un sustituto de diseñar límites de componentes.

La **delegación** instala un listener en un ancestro estable y decide con `closest`. Sirve para filas que aparecen después, no para registrar listeners “por deporte”. Confirmá que el resultado esté dentro del contenedor, porque `closest` puede encontrar un ancestro fuera del subárbol esperado.

```js
const menu = document.querySelector('[data-menu]');
menu.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || !menu.contains(button)) return;
  console.log(button.dataset.action); // por ejemplo: "archive"
});
```

Un mismo `AbortController` puede dar ciclo de vida a varios listeners: pasá `signal` al registrarlos y llamá `abort()` al desmontar la vista. Eso es menos frágil que recordar cada callback. `once` sirve para una acción única; `passive: true` sólo para listeners que no necesitan cancelar. No marques `passive` un `touchmove` si luego querés usar `preventDefault()`.

```js
const controller = new AbortController();
window.addEventListener('resize', render, { signal: controller.signal });
document.addEventListener('visibilitychange', pause, { signal: controller.signal });
controller.abort(); // ambos listeners quedan removidos
```

El laboratorio modela este contrato con `EventTarget` de Node. No pretende simular `document`, captura ni `closest`: eso sería un DOM falso. La misma idea comprobable —listener, filtro de acción y aborto— sí existe sin navegador.

## Formularios, constraint validation y custom elements

Empezá con HTML: `label`, `name`, `type="email"`, `required`, `min`, `max`, `pattern` y `button type="submit"` expresan contratos que navegador, teclado y tecnología asistiva entienden. En submit, `form.checkValidity()` responde si las restricciones nativas se cumplen; `reportValidity()` además solicita al navegador que las presente. Para una regla cruzada, `input.setCustomValidity('...')` integra el mensaje al mismo mecanismo y `setCustomValidity('')` lo limpia.

```js
const form = document.querySelector('form');
const repeat = form.elements.repeatPassword;
repeat.setCustomValidity(
  repeat.value === form.elements.password.value ? '' : 'Las claves no coinciden.',
);
console.log(form.checkValidity()); // false mientras el mensaje siga activo
```

La validación del cliente mejora la experiencia, pero el servidor sigue validando autorización, formato y reglas de negocio. No uses `novalidate` para evitar entender un mensaje: si la UI necesita uno propio, conservá foco, nombre del control y una descripción asociada con `aria-describedby` o texto visible. Un placeholder desaparece al escribir y no reemplaza a `label`.

Un custom element vale cuando encapsula una pieza reutilizable con comportamiento y API propios, no para convertir cada `div` en un mini-framework. Si participa en formularios, necesita soporte específico de la plataforma —por ejemplo un elemento asociado a form y `ElementInternals` donde esté disponible—. Hacé feature detection: `if ('attachInternals' in HTMLElement.prototype)`. Ofrecé una alternativa nativa o no prometas esa capacidad en runtimes que no la tengan.

## Semántica, teclado, foco y accesibilidad

La decisión más accesible suele ser la más corta: un enlace navega con `a href`; una acción usa `button`; un campo usa su `label`. Esos elementos ya tienen nombre, rol, foco, activación con teclado y expectativas conocidas. Un `div` con `click` no es un botón. Agregar `role="button"` mejora el anuncio, pero todavía te deja implementar Enter, Espacio, estado disabled, foco y comportamiento táctil; preferilo sólo cuando no haya elemento nativo que exprese la interacción.

El foco es estado de interacción, no decoración. Dejá visible `:focus-visible`, mantené orden de tabulación de documento y evitá `tabindex` positivo. Al abrir un diálogo, mové foco a un objetivo significativo; al cerrarlo, devolvelo al invocador si sigue conectado. No robes foco en una actualización menor ni ocultes contenido enfocado. Para errores al enviar, enfocá el primer campo inválido o un resumen claramente anunciado, y no dependas sólo del color o de un ícono.

Probá cada flujo con Tab, Shift+Tab, Enter, Espacio y Escape cuando corresponda; luego con zoom y lector de pantalla. WAI-ARIA complementa HTML, no lo reemplaza. Un `aria-live="polite"` puede anunciar un resultado asíncrono breve; no lo llenes de mensajes por cada tecla. La accesibilidad básica no se deja para “después de optimizar”: cambiar la semántica al final suele obligar a rehacer el componente.

## Web IDL: el borde entre plataforma y ECMAScript

Las especificaciones web describen sus APIs en **Web IDL**. Esa capa define interfaces, diccionarios, overloads y cómo se convierten argumentos JavaScript. Por eso una API puede aceptar un diccionario opcional, normalizar un booleano o lanzar `TypeError` antes de que tu callback corra. No infieras todos los detalles desde una firma TypeScript: es una ayuda estática, no la norma de conversión del runtime.

Por ejemplo, las opciones de `addEventListener` son un diccionario (`{ capture, once, passive, signal }`), no un objeto que la API conservará para editarlo después. Validá tu frontera pública antes de delegar y dejá que la plataforma haga el trabajo estándar. Cuando una API no está disponible, preguntá por la capacidad: `'serviceWorker' in navigator`, `typeof PerformanceObserver === 'function'`, o la propiedad exacta que vayas a usar. Feature detection no prueba soporte suficiente: también necesitás probar el flujo y el fallback.

## Del parsing a la composición

El navegador transforma bytes y HTML en DOM, CSS en reglas y luego calcula style. A partir de ahí puede necesitar layout para geometría, paint para píxeles y composición para combinar capas. No existe la regla “cambiar `transform` siempre es gratis”: depende de propiedades, capas, contenido y dispositivo. La regla útil es medir una interacción real, identificar qué invalida y reducir trabajo observable, no memorizar una lista de propiedades mágicas.

`requestAnimationFrame` agenda trabajo antes de un próximo frame de la ventana; usalo para una actualización visual que puede esperar, no para meter cómputo pesado. Leer layout después de escribir estilos puede obligar al navegador a sincronizar; agrupá lecturas y escrituras. Una animación respetuosa también consulta `matchMedia('(prefers-reduced-motion: reduce)')` y reduce o elimina movimiento no esencial.

## Event loop, frames y long tasks

JavaScript ejecuta una tarea hasta terminar. Luego el host drena microtasks antes de decidir render, input u otra tarea. Una cadena infinita de `queueMicrotask` puede retrasar pintura igual que un loop largo. Un callback de 120 ms bloquea input y frame aunque “sea async” en otra parte. Cortá trabajo grande en unidades que cedan el control —con `setTimeout`, `scheduler.yield()` si existe y fue detectado, o un Worker—, cuidando coherencia y cancelación.

`requestAnimationFrame` no garantiza 60 fps ni es un timer de background. Observá long tasks con las APIs disponibles y el profiler; no adivines por un `console.time`. Un presupuesto de frame depende de tasa de refresco y trabajo del navegador, así que “menos de 16 ms” es orientación, no contrato universal.

## Workers, Service Workers y canales

Un **Web Worker** corre JavaScript fuera del hilo principal y no tiene acceso al DOM. Se comunica con `postMessage`; un `ArrayBuffer` puede transferirse, quedando detached del emisor, o los datos pueden clonarse estructuradamente. `MessageChannel` ofrece dos puertos para una conversación dedicada. Diseñá mensajes como datos versionados y validalos: un Worker no convierte una regla de negocio insegura en segura.

Un **Service Worker** es distinto: es un worker de eventos que sólo puede afectar a un cliente que efectivamente controla dentro de su scope. Estar instalado y activo no alcanza para interceptar nada: además, su código debe manejar el evento `fetch` y responderlo, por ejemplo con `event.respondWith(...)`. Su ciclo de vida puede dejar una versión anterior controlando clientes existentes. Para cache, decidí qué pasa con contenido viejo, fallo de red, actualización y datos privados. Cache-first no es universal; una respuesta personalizada o mutable puede ser un error de seguridad o producto si la guardás sin criterio.

## Performance, carga y memoria

La Performance API permite medir `performance.mark('search-start')`, `performance.mark('search-end')` y `performance.measure('search', 'search-start', 'search-end')`. `PerformanceObserver` recibe tipos de entradas que el navegador soporte; consultá `PerformanceObserver.supportedEntryTypes` antes de asumir `longtask`, LCP u otra entrada. User Timing responde “cuánto duró mi tramo”, no “qué sintió toda persona usuaria”. Combiná medición de laboratorio, datos de campo cuando existan y una hipótesis concreta.

Lazy loading y code splitting reducen trabajo inicial sólo si aplazan código o recursos que no se necesitan todavía. `loading="lazy"` en imágenes es una pista al navegador, no garantía de orden; `import()` permite separar un módulo, pero agregá estado de carga y error accesible. Cacheá según vida y sensibilidad del recurso, con versión e invalidación. No precargues todo “por si acaso”: puede competir con la ruta crítica.

Una fuga común no es “olvidar `delete`”; es retener un nodo retirado desde un listener global, `MutationObserver`, timer, cache o closure. Al desmontar, abortá listeners, hacé `disconnect()` de observers, cancelá timers y soltá entradas de cache cuando ya no tengan dueño. Las herramientas de memoria validan la sospecha: navegá ida y vuelta y mirá objetos retenidos antes de culpar al GC.

## Laboratorio y aprendizaje real

En `starter.mjs`, `installActionRouter` modela delegación con un `EventTarget` de Node: acepta sólo acciones no vacías, registra con una `AbortSignal` opcional y devuelve una limpieza explícita que también se prueba sin signal. `validateNewsletter` produce el estado que una UI debe asociar a labels y mensajes, sin pretender reemplazar Constraint Validation del navegador. `node starter.mjs` empieza RED; completalo hasta GREEN y recién después compará `solution.mjs`.

Pista 1: `addEventListener` acepta `{ signal }`. Pista 2: `abort()` elimina el listener sin llamar manualmente al callback. Pista 3: llamá la función devuelta y despachá otra acción para probar la limpieza sin signal. Está terminado cuando pasan acción válida, acción vacía, aborto, limpieza explícita, formulario válido e inválido y contratos TypeError.

Recuperación: ¿target y currentTarget son iguales siempre? ¿qué limpia un AbortController? ¿qué diferencia hay entre `checkValidity` y validación de servidor? ¿por qué un button nativo gana a un div clickable? ¿cuándo puede pintar el navegador frente a microtasks? Transferí esto a una tabla con acciones delegadas y a un formulario con error de clave repetida; después diseñá una estrategia de cache para datos públicos y otra para datos de cuenta.

En tu sesión V2, primero respondé el diagnóstico socrático prediciendo recorrido del evento y foco posterior. El feedback puede corregir una confusión entre `preventDefault` y propagación, o entre Worker y Service Worker; la corrección queda ligada a la respuesta revisada. Sólo diagnóstico, práctica y evaluación observados generan evidencia para el mastery derivado. Dentro de 48 horas, sin mirar, inspeccioná una pantalla: nombrá sus controles, recorré teclado, buscá un listener sin ciclo de vida y explicá qué medirías antes de aplicar lazy loading.

## Referencias primarias

- [WHATWG DOM: Events y EventTarget](https://dom.spec.whatwg.org/#events)
- [WHATWG HTML: forms y constraint validation](https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#the-constraint-validation-api)
- [WHATWG HTML: custom elements](https://html.spec.whatwg.org/multipage/custom-elements.html)
- [Web IDL](https://webidl.spec.whatwg.org/)
- [WHATWG HTML: workers y event loops](https://html.spec.whatwg.org/multipage/workers.html)
- [Service Workers specification](https://w3c.github.io/ServiceWorker/)
- [W3C Performance Timeline](https://www.w3.org/TR/performance-timeline/)
- [WAI: Using ARIA](https://www.w3.org/WAI/ARIA/apg/practices/read-me-first/)
