# 6.1 — Paradigmas y modelado en JavaScript

## Por qué importa

Cuando una aplicación crece, el problema rara vez es que JavaScript no tenga una forma de escribir `if`. El problema es decidir quién puede cambiar qué, qué combinaciones son válidas y cómo entender una pantalla sin recorrer quince archivos. Los paradigmas son lentes para hacer esas decisiones visibles. No son bandos ni recetas: una misma aplicación puede usar objetos en el dominio, funciones para transformar datos y una vista declarativa para describir la UI.

Partí de una orden de compra. Tiene un total, un estado y transiciones permitidas. Si cualquiera puede asignar `status = 'shipped'`, el modelo permite enviar algo sin cobrarlo. Si guardás además `label = 'Enviado'` y `canShip = false`, aparecen tres verdades que se pueden desincronizar. El objetivo de este capítulo es que puedas elegir una representación pequeña que haga difícil escribir esa incoherencia.

## Objetivos observables

Al finalizar podés asignar responsabilidades, explicar qué mensaje acepta cada objeto, elegir composición cuando hay capacidades combinables, y modelar una transición inválida como error explícito. También podés distinguir push de pull, derivar estado sin duplicarlo y justificar por qué una forma de código reduce —o aumenta— la carga cognitiva de tu equipo.

## Etiqueta de estándar y runtime

Los objetos, funciones, closures, `Set` y módulos usados acá son ECMAScript. `EventTarget`, `Observable` o APIs de frameworks pertenecen al host o a bibliotecas y no son intercambiables por nombre. Antes de depender de una capacidad reciente, detectala en el runtime objetivo; no infieras soporte por el navegador, la versión de un framework o una demo aislada.

## Objetos, mensajes y responsabilidades

Un objeto útil no es una bolsa de datos con métodos decorativos. Representa una parte del dominio y responde mensajes que protegen sus reglas. Un mensaje dice qué se quiere hacer; no debería obligar al llamador a conocer cada campo interno. Para una orden, `pay()` expresa intención. `order.status = 'paid'` expone el mecanismo y deja la validación repartida entre todos los llamadores.

La responsabilidad debe estar cerca de la información que necesita y de la invariante que protege. La orden sabe desde qué estado puede cobrarse; un adaptador de pagos sabe hablar HTTP con un proveedor; la UI sabe mostrar un botón accesible. No hace falta que cada cosa sea una clase. Un objeto literal, una closure o un módulo pueden encapsular una responsabilidad igual de bien.

```js
const order = {
  status: 'draft',
  pay() {
    if (this.status !== 'draft') throw new RangeError('already processed');
    this.status = 'paid';
  },
};
order.pay();
console.log(order.status); // paid
```

El mensaje no vuelve mágico al diseño: si `pay` también renderiza HTML, escribe una base y manda correo, juntaste responsabilidades que cambian por motivos distintos. Separarlas no significa crear cinco capas; significa dejar claro dónde termina la regla del dominio y dónde empieza un efecto externo.

## Encapsulación, polimorfismo y delegación

Encapsular es ocultar detalles que el resto no necesita depender. En JavaScript podés hacerlo con campos privados, closures o convenciones de módulo. El valor es que la representación pueda cambiar sin obligar a editar cada consumidor. No confundas encapsulación con impedir toda lectura: una API pequeña de consulta puede ser parte del contrato. El laboratorio, en cambio, **no** usa encapsulación fuerte: `status` y `listeners` son observables. Protege transiciones sólo a través de `transition(order, event)`; una asignación directa puede saltear la regla a propósito. Es un límite didáctico explícito, no una promesa de seguridad.

Polimorfismo significa que distintos valores responden al mismo mensaje con una semántica acordada. Una política de descuento puede ser una función; no necesitás una superclase `DiscountStrategy` si hay dos funciones y ningún comportamiento compartido. Delegación es otra herramienta: un objeto busca comportamiento en su prototipo. Sirve para compartir un método sin copiarlo, pero no convierte la cadena de prototipos en el lugar natural para todo el modelo.

```js
const formatters = {
  ars: (cents) => `$${(cents / 100).toFixed(2)}`,
  free: () => 'Sin cargo',
};
console.log(formatters.ars(1250)); // $12.50
console.log(formatters.free()); // Sin cargo
```

Ambas funciones reciben un mensaje equivalente —formatear un monto— pero no comparten estado ni jerarquía. Si el dominio exige que cada política exponga auditoría, configuración común y ciclo de vida, una estructura más rica puede justificarse. Hasta entonces, la función es el contrato más chico.

## SOLID como heurísticas, no dogma

SOLID nombra señales útiles: una unidad con demasiados motivos de cambio, un reemplazo que rompe expectativas, una interfaz que obliga a implementar operaciones vacías o un dominio pegado a una base de datos. Son preguntas de revisión, no una lista para cumplir.

El principio de responsabilidad única no quiere decir “un archivo por función”: quiere decir que un cambio de regla de envío no debería requerir tocar el formateador de moneda. Abierto/cerrado no exige una fábrica antes de tener variantes; sugiere que, cuando las variantes aparezcan, las puedas agregar sin reescribir un `switch` disperso. Inversión de dependencias no prohíbe importar una librería: evita que una regla central dependa de un detalle que no controla.

La prueba práctica es el costo del próximo cambio. Si una abstracción tiene una implementación y no hay una variación plausible, agrega nombres, archivos y saltos mentales sin quitar riesgo. Conservá el `switch` local. Si el mismo `switch` se replica en tres bordes, extraer una política puede bajar el costo real.

## Composición sobre herencia y modelado de invariantes

Herencia modela una relación estable de “es un” y comparte una forma de comportamiento. Composición arma capacidades: una orden puede recibir una política de impuestos, una de envío y una función de notificación. Como esas decisiones se combinan, la composición evita una explosión de subclases como `OrdenExpressConDescuentoConRetiro`.

La flexibilidad no reemplaza reglas. Un invariante es algo que debe mantenerse cierto después de cada operación válida: el total es positivo; una orden enviada fue pagada; un stock no queda negativo. Ponelo donde se crea o cambia el dato, no sólo en el botón que hoy lo llama. El laboratorio implementa una máquina pequeña con ese criterio.

```js
const withTax = (rate) => (subtotal) => subtotal * (1 + rate);
const withFreeShipping = (subtotal) => ({ subtotal, shipping: 0 });
console.log(withFreeShipping(withTax(0.21)(100))); // { subtotal: 121, shipping: 0 }
```

Componer funciones es útil cuando cada paso tiene entrada y salida claras. Para operaciones con identidad, autorización o una transición con muchos caminos, un objeto o una tabla de estados puede comunicar mejor el contrato. Elegí por legibilidad del invariante, no por pureza ideológica.

## Imperativo, OOP, funcional y declarativo

Imperativo describe pasos y mutaciones: “recorré esta lista y acumulá”. Es directo para algoritmos locales y efectos ordenados. Orientado a objetos organiza datos y mensajes alrededor de responsabilidades. Funcional favorece transformaciones, inmutabilidad y composición, muy útil para datos que entran y salen. Declarativo describe el resultado buscado y deja la estrategia a otra capa: una consulta SQL, una regla CSS o un template de UI.

Ninguno gana siempre. Este ejemplo funcional transforma datos sin modificar el arreglo original:

```js
const amounts = [100, 200, 300];
const withTax = amounts.map((amount) => amount * 1.21);
console.log(withTax); // [121, 242, 363]
```

Si necesitás procesar millones de elementos con memoria ajustada, un bucle imperativo puede ser más claro y evitar arreglos intermedios. Si la lógica es “la orden acepta o rechaza una transición”, el mensaje de un objeto o función de transición comunica mejor que un conjunto de flags sueltos. La elección es local: nombrá el dato, el efecto y el invariante que querés que otra persona vea rápido.

## Eventos, observables y flujos

Un evento anuncia que algo ocurrió: `orderPaid`. El emisor no necesita conocer a todos los receptores. Eso desacopla, pero también oculta el recorrido: ¿quién actualiza el inventario?, ¿qué pasa si un listener falla?, ¿se puede desuscribir? Un `EventTarget` del navegador y un `EventEmitter` de Node tienen contratos distintos; verificá el que vayas a usar.

Un observable representa valores a lo largo del tiempo y normalmente ofrece suscripción y cancelación. Un flujo además obliga a pensar ritmo, orden, finalización y error. No uses eventos para reemplazar una llamada simple entre dos piezas que ya se conocen: sumás asincronía conceptual sin ganar independencia.

```js
const listeners = new Set();
const subscribe = (listener) => (listeners.add(listener), () => listeners.delete(listener));
const emit = (value) => listeners.forEach((listener) => listener(value));
let last;
const stop = subscribe((value) => {
  last = value;
});
emit('paid');
stop();
emit('shipped');
console.log(last); // paid
```

La desuscripción es parte del contrato, no un detalle. En una pantalla que se desmonta, conservar listeners puede mantener referencias y producir actualizaciones viejas. En este laboratorio la política es la nativa y simple: se invocan los listeners en orden de `Set`; si uno lanza, la entrega se interrumpe y `transition` propaga ese error. No hay aislamiento, reintento ni acumulación de errores. Si hay productor rápido y consumidor lento, definí además una estrategia de backpressure o cola; el nombre “stream” no la resuelve solo.

## Estado derivado y máquinas de estados

Guardá la fuente de verdad más pequeña. Si `canShip` depende de `status === 'paid'`, es estado derivado: calculalo cuando lo necesitás o mediante un selector memoizado si medir muestra que hace falta. Persistir ambos exige sincronizarlos en cada transición y habilita combinaciones imposibles, como `{ status: 'draft', canShip: true }`.

Una máquina de estados enumera estados, eventos y transiciones. No es sólo para ascensores o protocolos: un formulario, una carga y una orden tienen caminos válidos e inválidos. La tabla siguiente permite preguntar “¿qué evento desde qué estado?” antes de escribir condicionales dispersos.

```js
const next = { draft: { pay: 'paid' }, paid: { ship: 'shipped' }, shipped: {} };
const transition = (state, event) => {
  const result = next[state]?.[event];
  if (!result) throw new RangeError(`cannot ${event} from ${state}`);
  return result;
};
console.log(transition('paid', 'ship')); // shipped
```

No hace falta introducir una biblioteca de statecharts para tres estados. Una tabla y un test bastan. Si aparecen estados jerárquicos, concurrencia entre regiones, reintentos temporizados o visualización que el equipo necesita mantener, una herramienta especializada puede reducir errores; evaluá ese costo contra el de sostener tu propia máquina.

## Reactividad push y pull

En pull el consumidor pregunta: una vista lee `deriveLabel(order)` cuando renderiza. Es fácil seguir el origen de la lectura y el consumidor controla cuándo obtener el dato. En push el productor avisa: un listener recibe la orden nueva apenas ocurre una transición. Es útil para cambios que deben propagarse, pero el orden de notificaciones y la limpieza de suscripciones pasan a ser parte del modelo.

Muchas interfaces mezclan ambos: un evento push invalida una vista, y la vista hace pull de su estado derivado para renderizar. No guardes el mismo valor en cada capa para “hacerlo reactivo”. Conservá una fuente de verdad, propagá el cambio con un contrato claro y derivá la presentación desde esa fuente.

## Criterios de elección y carga cognitiva

Elegí la forma que haga más visible la regla y más corto el camino para responder “qué pasa si…”. Para datos que viajan sin reglas, un objeto plano y una función suelen alcanzar. Para reglas con identidad y cambios controlados, un objeto con mensajes o una función de transición sirve. Para transformaciones independientes, composición funcional. Para una UI o consulta, una descripción declarativa. Para cambios en el tiempo, eventos o un flujo con cancelación explícita.

Contá el costo completo: nombres nuevos, saltos entre módulos, estados invisibles, órdenes temporales y conocimiento que un integrante debe recordar. Una abstracción que evita tres líneas pero exige entender un factory, un registry y una interfaz aumenta carga cognitiva. También lo hace un `switch` duplicado en seis pantallas. El diseño correcto para hoy es el más chico que preserva los invariantes y deja una extensión obvia cuando la variación sea real.

## Errores comunes y contraejemplos

No llames “encapsulación” a esconder datos mientras los métodos aceptan cualquier valor. No uses herencia sólo para reutilizar dos líneas. No publiques eventos sin decidir qué ocurre con errores o listeners viejos. No conviertas un estado derivable en bandera persistida. Y no digas que un paradigma es mejor: explicá qué regla deja más visible en este caso.

Un contraejemplo útil: permitir `ship` desde `draft`. Cambiá una sola entrada de la tabla, ejecutá el caso y observá que la orden llega a `shipped` sin pasar por `paid`. Después devolvela a su forma válida y nombrá el invariante que la tabla protege.

## Laboratorio: una orden observable

Completá el starter. `createOrder(total)` debe rechazar totales no finitos o menores o iguales a cero, crear una orden en `draft` y conservar listeners. `transition(order, event)` debe devolver una orden nueva, aceptar sólo `draft → pay → paid → ship → shipped`, avisar a los listeners con el nuevo valor y rechazar los demás pares. La protección vale al usar esta API, no contra una escritura directa de los campos observables. Si un listener lanza, `transition` debe interrumpir la entrega y propagar el error. `deriveLabel(order)` debe calcular, no almacenar, `Borrador`, `Cobrado` o `Enviado`. Agregá `subscribe(order, listener)` con una desuscripción y comprobá que una transición posterior no notifica al listener removido.

Pista 1: representá las transiciones con un objeto indexado por estado y evento. Pista 2: un `Set` evita registrar dos veces la misma función y permite borrarla. Pista 3: copiá la orden con spread antes de cambiar `status`; los listeners de la orden previa reciben el siguiente valor, sin reescribir el pasado.

Está terminado cuando `node --check starter.mjs` pasa, ejecutar el starter antes de resolverlo falla, y tu solución verifica: creación válida, rechazo de total inválido, transición válida sin mutar la orden previa, transición inválida, etiqueta derivada, notificación, desuscripción sin una segunda notificación y propagación del error de un listener.

## Recuperación, transferencia y evaluación diferida

1. Sin mirar, explicá la diferencia entre mensaje y asignación directa. 2. Decí qué invariante protege la orden. 3. Compará un listener push con una lectura pull. 4. Nombrá un estado derivado de una UI que hoy guardás. 5. Justificá por qué no crearías una clase base para dos funciones de formato.

Transferencia 1: modelá un formulario con `editing`, `submitting`, `success` y `error`; escribí qué eventos son válidos. Transferencia 2: tomá una regla de descuentos repetida en tres lugares y decidí si una función compuesta o un objeto con identidad reduce más el costo de cambio.

Dentro de 48 horas, resolvé un caso nuevo sin apuntes: diseñá la transición de una reserva que puede cancelarse antes, pero no después, de confirmarse. Registrá una autoexplicación socrática y la corrección recibida. Sólo esa respuesta observada puede convertirse en evidencia, alimentar el scheduler de V2 o acercarte a mastery; no declares dominio por haber leído este capítulo.

## Referencias primarias

- [ECMA-262: Objects](https://tc39.es/ecma262/#sec-objects)
- [ECMA-262: ECMAScript language](https://tc39.es/ecma262/)
- [Node.js: Events](https://nodejs.org/api/events.html)
- [WHATWG DOM: EventTarget](https://dom.spec.whatwg.org/#interface-eventtarget)
- [TC39 process](https://tc39.es/process-document/)
