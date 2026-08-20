import assert from 'node:assert/strict';

export function Cuenta(titular, saldo = 0) {
  /* TODO: exigir new.target y guardar titular/saldo */
}

Cuenta.prototype.depositar = function depositar(monto) {
  /* TODO: validar monto finito positivo y devolver el saldo nuevo */
};

export function callbackDeDeposito(cuenta) {
  /* TODO: devolver una función ligada a cuenta.depositar */
}

assert.throws(() => Cuenta('Ada', 10), TypeError);
const ada = new Cuenta('Ada', 10);
assert.equal(ada.depositar(5), 15);
const depositarAda = callbackDeDeposito(ada);
assert.equal(depositarAda(3), 18);
assert.throws(() => ada.depositar(0), RangeError);
assert.equal(ada.saldo, 18);
