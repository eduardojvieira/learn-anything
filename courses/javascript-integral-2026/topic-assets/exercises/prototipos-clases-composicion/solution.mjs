import assert from 'node:assert/strict';

const speaker = {
  speak() {
    return `${this.name} habla`;
  },
};

export function makeSpeaker(name) {
  if (typeof name !== 'string' || name.trim() === '')
    throw new TypeError('name debe ser texto no vacío');
  return Object.assign(Object.create(speaker), { name });
}

export function Member(name) {
  if (typeof name !== 'string' || name.trim() === '')
    throw new TypeError('name debe ser texto no vacío');
  this.name = name;
}
Member.prototype.describe = function describe() {
  return `Miembro: ${this.name}`;
};

export class Account {
  static #currencies;
  static {
    this.#currencies = new Set(['ARS', 'USD']);
  }

  static acceptsCurrency(currency) {
    return this.#currencies.has(currency);
  }

  #cents = 0;

  #validateDeposit(cents) {
    if (!Number.isInteger(cents) || cents <= 0)
      throw new RangeError('cents debe ser entero positivo');
  }

  constructor(owner, currency = 'ARS') {
    if (typeof owner !== 'string' || owner.trim() === '')
      throw new TypeError('owner debe ser texto no vacío');
    if (!Account.acceptsCurrency(currency)) throw new RangeError('currency no admitida');
    this.owner = owner;
    this.currency = currency;
  }

  deposit(cents) {
    this.#validateDeposit(cents);
    this.#cents += cents;
  }

  get balance() {
    return this.#cents;
  }
}

export class RewardAccount extends Account {
  constructor(owner, currency, points = 0) {
    super(owner, currency);
    if (!Number.isInteger(points) || points < 0)
      throw new RangeError('points debe ser entero no negativo');
    this.points = points;
  }

  reward() {
    return `${this.owner} suma ${this.points} puntos`;
  }
}

export function composeNotifier(format, send) {
  if (typeof format !== 'function' || typeof send !== 'function')
    throw new TypeError('format y send deben ser funciones');
  return (message) => send(format(message));
}

const ada = makeSpeaker('Ada');
assert.equal(ada.speak(), 'Ada habla');
assert.strictEqual(Object.getPrototypeOf(ada), speaker);
assert.equal(Object.hasOwn(ada, 'speak'), false);
assert.throws(() => makeSpeaker(''), TypeError);
const lin = new Member('Lin');
assert.equal(lin.describe(), 'Miembro: Lin');
assert.strictEqual(Object.getPrototypeOf(lin), Member.prototype);
assert.strictEqual(new Member('Noa').describe, lin.describe);
assert.throws(() => new Member(null), TypeError);
assert.equal(Account.acceptsCurrency('ARS'), true);
assert.equal(Account.acceptsCurrency('EUR'), false);
assert.equal(Account.currencies, undefined);
const account = new Account('Ada');
account.deposit(250);
assert.equal(account.balance, 250);
assert.equal(account['#cents'], undefined);
assert.throws(() => account.deposit(0), RangeError);
assert.throws(() => new Account('Ada', 'EUR'), RangeError);
const reward = new RewardAccount('Sol', 'USD', 2);
reward.deposit(75);
assert.equal(reward.balance, 75);
assert.equal(reward.reward(), 'Sol suma 2 puntos');
assert.equal(reward instanceof RewardAccount, true);
assert.equal(reward instanceof Account, true);
assert.throws(() => new RewardAccount('Sol', 'ARS', -1), RangeError);
let sent = '';
const notify = composeNotifier(
  (message) => `[aviso] ${message}`,
  (message) => (sent = message),
);
assert.equal(notify('listo'), '[aviso] listo');
assert.equal(sent, '[aviso] listo');
assert.throws(() => composeNotifier(null, () => {}), TypeError);
