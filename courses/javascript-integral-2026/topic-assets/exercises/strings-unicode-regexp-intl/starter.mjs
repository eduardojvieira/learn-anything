import assert from 'node:assert/strict';

export function graphemeCount(text, locale = 'es') {
  // TODO: validar string, feature-detect Intl.Segmenter y contar grafemas.
}

export function normalizeLookup(text) {
  // TODO: NFC y minúsculas, sin eliminar diacríticos.
}

export function parseReservationReference(text) {
  // TODO: extraer RES- seguido de seis dígitos como token Unicode completo.
}

export function formatReservation(amount, instant, locale, timeZone, currency) {
  // TODO: aceptar Date válido, epoch numérico o ISO con Z/offset; rechazar string sin zona antes de Date.
}

export function sameDisplayName(a, b, locale = 'es') {
  // TODO: comparar con Intl.Collator y sensibilidad base.
}

export function temporalAvailable() {
  // TODO: detectar la capacidad sin asumir que Temporal existe.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
assert.equal(graphemeCount('👨‍👩‍👧‍👦'), 1);
assert.equal(normalizeLookup('Cafe\u0301'), 'café');
assert.equal(parseReservationReference('Reserva RES-120045 confirmada'), 'RES-120045');
assert.throws(() => formatReservation(1, '2026-08-20T12:00:00', 'en-US', 'UTC', 'USD'), TypeError);
assert.equal(temporalAvailable(), typeof globalThis.Temporal !== 'undefined');
