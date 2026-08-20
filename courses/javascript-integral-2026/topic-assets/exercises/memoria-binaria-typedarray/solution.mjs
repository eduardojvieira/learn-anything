import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { TextDecoder, TextEncoder } from 'node:util';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

/** @param {unknown} value @param {string} name */
function byte(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff)
    throw new RangeError(`${name} debe ser un byte entre 0 y 255`);
  return value;
}

/** Codifica version, flags, largo UTF-8 (uint16 big-endian) y payload. */
export function encodePacket(version, flags, text) {
  byte(version, 'version');
  byte(flags, 'flags');
  if (typeof text !== 'string') throw new TypeError('text debe ser string');
  const payload = encoder.encode(text);
  if (payload.byteLength > 0xffff) throw new RangeError('payload excede uint16');
  const buffer = new ArrayBuffer(4 + payload.byteLength);
  const view = new DataView(buffer);
  view.setUint8(0, version);
  view.setUint8(1, flags);
  view.setUint16(2, payload.byteLength, false);
  new Uint8Array(buffer, 4).set(payload);
  return new Uint8Array(buffer);
}

/** Decodifica el formato creado por encodePacket y rechaza bytes sobrantes/truncados. */
export function decodePacket(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes debe ser Uint8Array');
  if (bytes.byteLength < 4) throw new RangeError('header incompleto');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = view.getUint16(2, false);
  if (bytes.byteLength !== 4 + size) throw new RangeError('largo de payload inválido');
  return {
    version: view.getUint8(0),
    flags: view.getUint8(1),
    text: decoder.decode(bytes.subarray(4)),
  };
}

/** @param {Uint8Array} bytes */
function toHex(bytes) {
  if (typeof bytes.toHex === 'function') return bytes.toHex();
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

/** @param {string} hex */
function fromHex(hex) {
  if (!/^(?:[\da-fA-F]{2})*$/.test(hex)) throw new TypeError('hex inválido');
  if (typeof Uint8Array.fromHex === 'function') return Uint8Array.fromHex(hex);
  return Uint8Array.from(hex.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
}

/** @param {Uint8Array} bytes */
function toBase64(bytes) {
  if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
  return Buffer.from(bytes).toString('base64');
}

/** @param {string} base64 */
function fromBase64Fallback(base64) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
    throw new TypeError('base64 inválido');
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'));
  if (Buffer.from(bytes).toString('base64') !== base64) throw new TypeError('base64 no canónico');
  return bytes;
}

/** @param {string} base64 */
function fromBase64(base64) {
  if (typeof Uint8Array.fromBase64 === 'function') return Uint8Array.fromBase64(base64);
  return fromBase64Fallback(base64);
}

/** Serializa bytes a hexadecimal y base64, usando Uint8Array ES2026 si existe. */
export function encodeBytes(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('bytes debe ser Uint8Array');
  return { hex: toHex(bytes), base64: toBase64(bytes) };
}

/** Invierte encodeBytes y verifica que ambas representaciones describan los mismos bytes. */
export function decodeBytes(hex, base64) {
  if (typeof hex !== 'string' || typeof base64 !== 'string')
    throw new TypeError('hex y base64 deben ser strings');
  const fromText = fromHex(hex);
  const fromWire = fromBase64(base64);
  if (
    fromText.length !== fromWire.length ||
    fromText.some((value, index) => value !== fromWire[index])
  )
    throw new RangeError('hex y base64 no describen los mismos bytes');
  return fromText;
}

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
assert.throws(() => decodeBytes('0', 'AA=='), TypeError);
assert.throws(() => fromBase64Fallback('AQ==!'), TypeError);
assert.throws(() => fromBase64Fallback('AB=='), TypeError);
