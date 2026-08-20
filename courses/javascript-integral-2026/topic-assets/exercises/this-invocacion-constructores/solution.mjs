import assert from 'node:assert/strict';

export function Cuenta(titular, saldo = 0) {
  if (!new.target) throw new TypeError('Cuenta requiere new');
  if (typeof titular !== 'string') throw new TypeError('titular');
  if (!Number.isFinite(saldo) || saldo < 0) throw new RangeError('saldo');
  this.titular = titular;
  this.saldo = saldo;
}

Cuenta.prototype.depositar = function depositar(monto) {
  if (!Number.isFinite(monto) || monto <= 0) throw new RangeError('monto');
  this.saldo += monto;
  return this.saldo;
};

export function callbackDeDeposito(cuenta) {
  if (!(cuenta instanceof Cuenta)) throw new TypeError('cuenta');
  return cuenta.depositar.bind(cuenta);
}

assert.throws(() => Cuenta('Ada', 10), /requiere new/);
const ada = new Cuenta('Ada', 10);
assert.equal(ada.depositar(5), 15);
const depositarAda = callbackDeDeposito(ada);
assert.equal(depositarAda(3), 18);
assert.throws(() => ada.depositar(0), RangeError);
assert.equal(ada.saldo, 18);
assert.throws(() => new Cuenta('Ada', -1), RangeError);
assert.throws(() => new (() => {})(), TypeError);
