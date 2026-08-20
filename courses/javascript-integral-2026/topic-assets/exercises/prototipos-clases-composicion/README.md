# 3.2 — Prototipos, clases, privados y composición

## El método no vive necesariamente donde lo ves

Cuando ejecutás `ada.speak()`, es tentador imaginar que `speak` está guardado dentro de `ada`. A veces sí; muchas veces no. JavaScript busca primero una propiedad propia y, si no la encuentra, sigue un enlace interno llamado `[[Prototype]]`. Esa búsqueda explica objetos creados con `Object.create`, instancias de constructores, `class` y `extends`. Las clases no reemplazan a los prototipos: son una sintaxis más segura y legible para trabajar sobre ellos.

La pregunta útil no es “¿objetos o clases?”. Es: ¿qué objeto recibe la operación?, ¿dónde se resuelve el comportamiento?, ¿qué estado debe quedar encapsulado y qué variaciones conviene combinar? Con esas cuatro preguntas evitás tanto copiar métodos por accidente como inventar jerarquías que después nadie puede cambiar.

## Cadena de prototipos y delegación

Una lectura como `obj.name` busca `name` primero en `obj`; si no está, busca en `Object.getPrototypeOf(obj)`, y repite hasta llegar a `null`. Una escritura normal, en cambio, crea o actualiza una propiedad propia salvo que intervenga un setter. Por eso delegar no equivale a compartir estado: compartís el comportamiento del prototipo, pero cada receptor puede tener sus propios datos.

```js
const speaker = {
  speak() {
    return `${this.name} habla`;
  },
};
const ada = Object.create(speaker);
ada.name = 'Ada';
console.log(ada.speak()); // Ada habla
console.log(Object.hasOwn(ada, 'speak')); // false
console.log(Object.getPrototypeOf(ada) === speaker); // true
```

`this` se decide por el receptor de la llamada: `ada.speak()` entra al método delegado, pero dentro vale `ada`. Si hacés `const hablar = ada.speak; hablar()`, una función común ya no recibe ese receptor automáticamente; en modo estricto, `this` será `undefined`. No arregles eso con un `bind` global sin entender quién debe ser el receptor. A veces querés una función independiente; a veces querés mantener el método.

Una propiedad propia puede **sombrear** al prototipo sin mutarlo:

```js
ada.speak = () => 'Ada responde localmente';
console.log(ada.speak()); // Ada responde localmente
console.log(speaker.speak.call({ name: 'Lin' })); // Lin habla
```

La segunda asignación sólo cambia `ada`. Esto es útil para adaptar un objeto puntual, pero puede esconder una regla común. Si todos los objetos necesitan el cambio, modificá el prototipo o, mejor, construí un prototipo correcto antes de crear instancias. Evitá cambiar el prototipo de objetos ya usados en caminos calientes: `Object.setPrototypeOf` existe, pero hace más difícil razonar y puede perjudicar optimizaciones del motor.

`Object.create(null)` crea un diccionario sin `Object.prototype`. No tiene `toString`, ni `hasOwnProperty`; usá `Object.hasOwn(obj, key)`. Es una opción deliberada para mapas de claves no confiables, no un reemplazo automático de `Map` ni una necesidad cotidiana.

## Funciones constructoras: el contrato de `new`

Antes de `class`, el patrón corriente era una función llamada con `new`. `new Member('Lin')` crea un objeto cuyo prototipo es `Member.prototype`, llama a `Member` con ese objeto como `this` y devuelve la instancia, salvo que el constructor devuelva explícitamente otro objeto. Los métodos en `Member.prototype` se delegan: no se copian a cada instancia.

```js
function Member(name) {
  if (typeof name !== 'string' || name.trim() === '') throw new TypeError('name');
  this.name = name;
}
Member.prototype.describe = function describe() {
  return `Miembro: ${this.name}`;
};
const lin = new Member('Lin');
const noa = new Member('Noa');
console.log(lin.describe()); // Miembro: Lin
console.log(lin.describe === noa.describe); // true
```

La igualdad final prueba que ambas instancias encuentran la misma función, no que una copia idéntica fue creada. Como una función constructora común también puede invocarse sin `new`, `Member('Lin')` no crea la instancia prometida; en módulos, además, `this` es `undefined` y fallará. Las clases previenen esa invocación: `Account()` sin `new` lanza TypeError. En código nuevo preferí `class` cuando el modelo es una instancia con estado y métodos; entendé constructores para leer bibliotecas, legado y el propio mecanismo.

No confundas `Member.prototype` con el prototipo de la función `Member`. El primero es el objeto que recibirán instancias creadas con `new Member`; el segundo se alcanza con `Object.getPrototypeOf(Member)` y participa porque las funciones también son objetos. Esa distinción evita errores al inspeccionar cadenas.

## `class`, `extends`, `super` y métodos estáticos

Una declaración `class` crea una función constructora y configura métodos de instancia en `Class.prototype`. Su sintaxis hace no enumerables esos métodos y ejecuta el cuerpo en modo estricto. No convierte los objetos en otra cosa: `Object.getPrototypeOf(new Account('Ada')) === Account.prototype` sigue siendo una afirmación central.

```js
class Account {
  constructor(owner) {
    this.owner = owner;
  }
  label() {
    return `Cuenta de ${this.owner}`;
  }
  static from({ owner }) {
    return new Account(owner);
  }
}
const account = Account.from({ owner: 'Ada' });
console.log(account.label()); // Cuenta de Ada
console.log(typeof Account.from, typeof account.from); // function undefined
```

`static` pertenece a la clase, no a cada instancia. Es apropiado para una fábrica, un registro o una política que no depende de una cuenta particular. No lo uses como bolsa global: seguís necesitando un contrato claro, validación y una decisión sobre mutabilidad.

`extends` arma dos relaciones de delegación: `RewardAccount.prototype` delega en `Account.prototype` para métodos de instancia, y la clase `RewardAccount` delega en `Account` para heredar miembros estáticos. En un constructor derivado, `super(...)` debe ejecutarse antes de acceder a `this`; es cuando se inicializa la parte base del objeto.

```js
class RewardAccount extends Account {
  constructor(owner, points = 0) {
    super(owner);
    this.points = points;
  }
  label() {
    return `${super.label()} (${this.points} puntos)`;
  }
}
const reward = new RewardAccount('Sol', 2);
console.log(reward.label()); // Cuenta de Sol (2 puntos)
console.log(reward instanceof Account); // true
```

`super.label()` busca el método en el prototipo padre pero lo invoca con el `this` actual, `reward`. Sobrescribir sólo para repetir el método base es ruido; sobrescribí cuando agregás una regla propia. Y no uses `instanceof` como validación de una frontera remota: responde sobre una cadena de prototipos, puede fallar entre realms y no garantiza que un objeto tenga datos válidos.

## Campos privados, métodos privados y bloques estáticos

Un campo `#cents` no es una propiedad cuyo nombre sea `'#cents'`. Es una marca privada declarada léxicamente: sólo el cuerpo de la clase que la conoce puede escribir `this.#cents`. Esto permite proteger un invariante aunque alguien agregue propiedades públicas de nombres parecidos.

```js
class Balance {
  #cents = 0;
  #validateDeposit(cents) {
    if (!Number.isInteger(cents) || cents <= 0) throw new RangeError('cents');
  }
  deposit(cents) {
    this.#validateDeposit(cents);
    this.#cents += cents;
  }
  get value() {
    return this.#cents;
  }
}
const balance = new Balance();
balance.deposit(250);
console.log(balance.value, balance['#cents']); // 250 undefined
```

El acceso `balance.#cents` fuera de la clase ni siquiera se puede parsear. La notación de corchetes busca una string ordinaria y devuelve `undefined` si esa clave no existe; no abre el estado privado. Un método privado como `#validateDeposit` sirve para una regla interna compartida por métodos públicos: `deposit` no decide por su cuenta qué entrada es válida, delega esa invariancia a un único lugar. No declares privado todo por reflejo: dejá pública la mínima superficie útil y usá privados para invariantes que no querés que consumidores salteen.

Las subclases no pueden nombrar privados declarados por el padre. Una `RewardAccount` puede llamar `deposit`, pero no `this.#cents`; el padre conserva el control de su representación. Si una subclase necesita un dato, exponé un método o getter público/protegido por contrato, no dupliques estado ni uses un campo público como bypass.

Un bloque `static` corre una vez al evaluar la clase y puede inicializar metadatos complejos sin ensuciar el módulo:

```js
class CurrencyPolicy {
  static #allowed;
  static {
    this.#allowed = new Set(['ARS', 'USD']);
  }
  static accepts(currency) {
    return this.#allowed.has(currency);
  }
}
console.log(CurrencyPolicy.accepts('ARS')); // true
console.log(CurrencyPolicy.accepts('EUR')); // false
```

El `Set` queda privado: consumidores consultan `accepts`, pero no pueden mutar la política con `CurrencyPolicy.allowed.add(...)`. Usalo para inicialización de la clase que realmente necesita su encapsulación. Para una constante simple, `const allowed = new Set(...)` en el módulo es más directo. Campos privados, métodos privados y static blocks son parte del estándar moderno, pero tu runtime objetivo puede ser viejo: detectá soporte con parseo o una matriz de versiones antes de publicar código que deba ejecutarse allí. No infieras soporte por user agent.

## Herencia frente a composición

Herencia expresa una relación estable de “es un”: una `RewardAccount` sigue cumpliendo el contrato de `Account`. Cada override agrega una obligación: una instancia derivada debe comportarse donde se espera la base. Si para combinar notificación por email, formato, reintentos y auditoría empezás a crear `EmailRetriableAuditedAccount`, la jerarquía ya te está diciendo que el problema no es de tipos sino de capacidades combinables.

La composición recibe piezas con contratos chicos:

```js
const composeNotifier = (format, send) => {
  if (typeof format !== 'function' || typeof send !== 'function') throw new TypeError('callbacks');
  return (message) => send(format(message));
};
let sent = '';
const notify = composeNotifier(
  (m) => `[aviso] ${m}`,
  (m) => (sent = m),
);
console.log(notify('listo')); // [aviso] listo
console.log(sent); // [aviso] listo
```

`format` decide la representación; `send`, el efecto. Podés reemplazar uno sin inventar una clase hija. La composición no elimina diseño: definí qué recibe cada función, qué devuelve, quién maneja errores y si el efecto puede repetirse. Para una relación realmente estable y comportamiento compartido, `extends` sigue siendo legible. Para políticas ortogonales que se mezclan, preferí funciones, objetos colaboradores o delegación explícita.

## Laboratorio: cuentas con límites y un notificador compuesto

Completá `starter.mjs`. `makeSpeaker(name)` exige texto no vacío, crea una propiedad propia `name` y delega `speak()` al prototipo sin copiarlo. `Member(name)` debe ser una función constructora que valida el nombre; sus instancias comparten `Member.prototype.describe`.

`Account` admite sólo owners no vacíos y monedas `ARS` o `USD`, inicializadas en un Set privado por un bloque `static` y consultadas con `Account.acceptsCurrency`. Su saldo privado empieza en cero; `deposit` delega la validación de enteros positivos a `#validateDeposit` y `balance` lo expone como número. `RewardAccount` extiende `Account`, llama `super` antes de usar `this`, exige puntos enteros no negativos y devuelve exactamente `"Sol suma 2 puntos"` para el caso guiado. `composeNotifier(format, send)` valida ambos callbacks y devuelve una función que primero formatea y después envía.

Pista 1: para delegar usá `Object.create(speaker)` y para verificarlo usá `Object.getPrototypeOf`; `Object.assign` sólo agrega el estado propio. Pista 2: declarás `#cents`, `#validateDeposit` y `#currencies` en la clase base; la subclase usa el getter y la clase expone `acceptsCurrency`, no los privados. Pista 3: el cuerpo de un constructor derivado empieza con `super(owner, currency)`; el callback compuesto puede ser una sola arrow que devuelve lo que devuelva `send`.

Está terminado cuando `node starter.mjs` falla antes de los TODO, `node solution.mjs` termina con código 0 y los asserts cubren delegación, prototipo compartido, el rechazo de depósito inválido por `#validateDeposit`, privado, static block, `extends` y composición. Probá además `account['#cents']` y `Account.currencies`: que den `undefined` no significa que los privados sean accesibles.

## Recuperación, transferencia y evidencia V2

Sin mirar: ¿en qué orden se busca una propiedad?, ¿qué hace `new` con `Member.prototype`?, ¿por qué `super` precede a `this`?, ¿por qué `'#cents'` no lee `#cents`?, ¿qué variación te haría preferir composición? Transferí el laboratorio a un cliente HTTP: una clase base puede representar un cliente concreto, mientras autenticación, reintento y logging conviene recibirlos como capacidades. Después diseñá un segundo caso donde la herencia sí sea estable y justificá el contrato sustituble.

En V2, respondé primero el diagnóstico socrático: predecí qué método gana cuando una propiedad propia sombrea al prototipo y explicá por qué el saldo no aparece con corchetes. El tutor puede pedirte que corrijas una jerarquía innecesaria; registrá la explicación corregida junto a la respuesta. Esa práctica observada, el feedback y una solución verificable pueden producir evidencia. El mastery es derivado de esa evidencia; no lo declara este capítulo ni una autoevaluación.

Dentro de 48 horas, sin apuntes, implementá una `SubscriptionAccount` que valide un límite y componé una política de aviso distinta. Compará tu traza con la predicción inicial: si falló, anotá si confundiste delegación con copia, miembro static con miembro de instancia o privacidad con una clave string. Esa autoexplicación hace que el feedback sea corregible y reutilizable.

## Referencias primarias

- [ECMA-262 2026: objetos y cadena de prototipos](https://tc39.es/ecma262/2026/multipage/ordinary-and-exotic-objects-behaviours.html)
- [ECMA-262 2026: funciones y constructores](https://tc39.es/ecma262/2026/multipage/ecmascript-language-functions-and-classes.html)
- [ECMA-262 2026: definiciones de clases](https://tc39.es/ecma262/2026/multipage/ecmascript-language-functions-and-classes.html#sec-class-definitions)
- [ECMA-262 2026: campos y métodos privados](https://tc39.es/ecma262/2026/multipage/ecmascript-language-functions-and-classes.html#sec-private-names)
- [ECMA-262 2026: elementos estáticos de clase](https://tc39.es/ecma262/2026/multipage/ecmascript-language-functions-and-classes.html#sec-class-static-block-definition-evaluation)
