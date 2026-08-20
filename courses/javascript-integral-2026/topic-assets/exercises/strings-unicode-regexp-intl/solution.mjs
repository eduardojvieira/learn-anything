import assert from 'node:assert/strict';

const HAS_EXPLICIT_ZONE = /[zZ]$|[+-]\d{2}:\d{2}$/;

export function graphemeCount(text, locale = 'es') {
  if (typeof text !== 'string') throw new TypeError('text debe ser string');
  if (typeof Intl.Segmenter !== 'function') throw new Error('Intl.Segmenter no está disponible');
  return [...new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(text)].length;
}

export function normalizeLookup(text) {
  if (typeof text !== 'string') throw new TypeError('text debe ser string');
  return text.normalize('NFC').toLowerCase();
}

export function parseReservationReference(text) {
  if (typeof text !== 'string') throw new TypeError('text debe ser string');
  return (
    /(?<![\p{L}\p{N}_])(?<reference>RES-\d{6})(?![\p{L}\p{N}_])/u.exec(text)?.groups.reference ??
    null
  );
}

export function formatReservation(amount, instant, locale, timeZone, currency) {
  if (!Number.isFinite(amount)) throw new TypeError('amount debe ser finito');
  if (
    (typeof instant === 'string' && !HAS_EXPLICIT_ZONE.test(instant)) ||
    (typeof instant !== 'string' && typeof instant !== 'number' && !(instant instanceof Date))
  )
    throw new TypeError('instant debe ser Date, epoch numérico o ISO con zona');
  const date = new Date(instant);
  if (Number.isNaN(date.valueOf())) throw new TypeError('instant debe ser una fecha válida');
  return {
    amount: new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount),
    date: new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone,
    }).format(date),
  };
}

export function sameDisplayName(a, b, locale = 'es') {
  if (typeof a !== 'string' || typeof b !== 'string')
    throw new TypeError('los nombres deben ser string');
  return new Intl.Collator(locale, { sensitivity: 'base' }).compare(a, b) === 0;
}

export function temporalAvailable() {
  return typeof globalThis.Temporal !== 'undefined';
}

assert.equal(graphemeCount('💡'), 1);
assert.equal(graphemeCount('e\u0301'), 1);
assert.equal(graphemeCount('👨‍👩‍👧‍👦'), 1);
assert.throws(() => graphemeCount(1), TypeError);
assert.equal(normalizeLookup('Cafe\u0301'), 'café');
assert.equal(normalizeLookup('José'), 'josé');
assert.notEqual(normalizeLookup('José'), normalizeLookup('Jose'));
assert.equal(parseReservationReference('Reserva RES-120045 confirmada'), 'RES-120045');
assert.equal(parseReservationReference('xRES-120045'), null);
assert.equal(parseReservationReference('RES-120045_'), null);
assert.throws(() => parseReservationReference(null), TypeError);
const receipt = formatReservation(1234.5, '2026-08-20T12:00:00Z', 'en-US', 'UTC', 'USD');
assert.deepEqual(receipt, {
  amount: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(1234.5),
  date: new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date('2026-08-20T12:00:00Z')),
});
assert.equal(
  formatReservation(1, new Date('2026-08-20T12:00:00Z'), 'en-US', 'UTC', 'USD').date,
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date('2026-08-20T12:00:00Z')),
);
assert.equal(
  formatReservation(1, Date.parse('2026-08-20T12:00:00Z'), 'en-US', 'UTC', 'USD').date,
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date('2026-08-20T12:00:00Z')),
);
assert.throws(() => formatReservation(Infinity, 0, 'en-US', 'UTC', 'USD'), TypeError);
assert.throws(() => formatReservation(1, 'no fecha', 'en-US', 'UTC', 'USD'), TypeError);
assert.throws(() => formatReservation(1, '2026-08-20T12:00:00', 'en-US', 'UTC', 'USD'), TypeError);
assert.equal(sameDisplayName('Árbol', 'arbol'), true);
assert.equal(sameDisplayName('Árbol', 'arbusto'), false);
assert.equal(temporalAvailable(), typeof globalThis.Temporal !== 'undefined');
