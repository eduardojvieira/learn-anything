import assert from 'node:assert/strict';

const speaker = {
  speak() {
    return `${this.name} habla`;
  },
};

/** Crea una instancia que delega speak() en speaker, sin copiar el método. */
export function makeSpeaker(name) {
  /* TODO: validar name y usar Object.create(speaker) */
}

/** Constructor clásico: las instancias comparten describe() por prototype. */
export function Member(name) {
  /* TODO: requerir name string no vacío */
}
Member.prototype.describe = function describe() {
  /* TODO */
};

export class Account {
  static #currencies;
  static {
    /* TODO: inicializar #currencies con el Set de monedas admitidas */
  }

  static acceptsCurrency(currency) {
    /* TODO: consultar #currencies sin exponerla */
  }

  #cents = 0;

  #validateDeposit(cents) {
    /* TODO: aceptar sólo enteros positivos */
  }

  constructor(owner, currency = 'ARS') {
    /* TODO: validar owner y currency */
  }

  deposit(cents) {
    /* TODO: llamar #validateDeposit y actualizar #cents */
  }

  get balance() {
    /* TODO */
  }
}

export class RewardAccount extends Account {
  constructor(owner, currency, points = 0) {
    /* TODO: super antes de this; validar puntos */
  }

  reward() {
    /* TODO */
  }
}

/** Devuelve una función: la política de formato y el transporte son capacidades separadas. */
export function composeNotifier(format, send) {
  /* TODO: validar ambas funciones y componerlas */
}

// RED inicialmente: completá los contratos y recién después consultá solution.mjs.
const ada = makeSpeaker('Ada');
assert.equal(ada.speak(), 'Ada habla');
assert.strictEqual(Object.getPrototypeOf(ada), speaker);
assert.equal(new Member('Lin').describe(), 'Miembro: Lin');
const account = new RewardAccount('Sol', 'ARS', 2);
account.deposit(250);
assert.equal(account.balance, 250);
assert.equal(account.reward(), 'Sol suma 2 puntos');
let sent = '';
composeNotifier(
  (message) => `[aviso] ${message}`,
  (message) => (sent = message),
)('listo');
assert.equal(sent, '[aviso] listo');
