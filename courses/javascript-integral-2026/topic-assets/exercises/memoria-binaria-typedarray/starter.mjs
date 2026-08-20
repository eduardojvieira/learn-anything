import assert from 'node:assert/strict';

/** Codifica version, flags, largo UTF-8 (uint16 big-endian) y payload. */
export function encodePacket(_version, _flags, _text) {
  // TODO: validá version/flags como bytes y text como string.
  // TODO: usá TextEncoder y DataView; el largo debe ser uint16 big-endian.
}

/** Decodifica el formato creado por encodePacket y rechaza bytes sobrantes/truncados. */
export function decodePacket(_bytes) {
  // TODO: aceptá sólo Uint8Array y validá el header y el largo antes de leer.
}

/** Serializa bytes a hexadecimal y base64, usando Uint8Array ES2026 si existe. */
export function encodeBytes(_bytes) {
  // TODO: devolvé { hex, base64 }, con feature detection y fallback de Node.
}

/** Invierte encodeBytes y verifica que ambas representaciones describan los mismos bytes. */
export function decodeBytes(_hex, _base64) {
  // TODO: decodificá, compará byte a byte y devolvé un Uint8Array nuevo.
}

// RED inicialmente: implementá hasta que pase. solution.mjs es referencia posterior.
const packet = encodePacket(1, 0b101, 'ñandú');
assert.deepEqual([...packet], [1, 5, 0, 7, 195, 177, 97, 110, 100, 195, 186]);
assert.deepEqual(decodePacket(packet), { version: 1, flags: 5, text: 'ñandú' });
assert.equal(new DataView(packet.buffer).getUint16(2, false), 7);
assert.notEqual(new DataView(packet.buffer).getUint16(2, true), 7);
const wire = encodeBytes(packet);
assert.equal(wire.hex, '01050007c3b1616e64c3ba');
assert.deepEqual([...decodeBytes(wire.hex, wire.base64)], [...packet]);
assert.throws(() => encodePacket(256, 0, ''), RangeError);
assert.throws(() => encodePacket(1, 0, 'x'.repeat(0x10000)), RangeError);
assert.throws(() => decodePacket(packet.subarray(0, -1)), RangeError);
assert.throws(() => decodePacket(new Uint8Array([...packet, 0])), RangeError);
assert.throws(() => decodeBytes('00', 'AQ=='), RangeError);
