import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { EventEmitter } from 'node:events';
import { StringDecoder } from 'node:string_decoder';
import { fileURLToPath } from 'node:url';

/** Valida --input y un límite de CLI o entorno para una CLI de archivos. */
export function parseOptions(argv, env = process.env) {
  if (!Array.isArray(argv)) throw new TypeError('argv debe ser un array');
  const inputAt = argv.indexOf('--input');
  const input = argv[inputAt + 1];
  if (inputAt < 0 || typeof input !== 'string' || input.startsWith('--'))
    throw new TypeError('--input requiere una ruta');
  const rawLimit = argv.includes('--limit')
    ? argv[argv.indexOf('--limit') + 1]
    : (env.LINE_LIMIT ?? '1000');
  const limit = Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new RangeError('limit debe ser entero positivo');
  return { input, limit };
}

/** Lee UTF-8 desde un path o file: URL, sin aceptar directorios. */
export async function readText(location) {
  const path =
    location instanceof URL || (typeof location === 'string' && location.startsWith('file:'))
      ? fileURLToPath(location)
      : location;
  if (typeof path !== 'string') throw new TypeError('location debe ser path o file: URL');
  if (!(await stat(path)).isFile()) throw new TypeError('location debe ser un archivo');
  return readFile(path, 'utf8');
}

/** Une líneas partidas entre chunks y notifica cada línea completa. */
export async function collectLines(readable, events = new EventEmitter()) {
  let pending = '';
  const lines = [];
  const decoder = new StringDecoder('utf8');
  for await (const chunk of readable) {
    const parts = (pending + decoder.write(chunk)).split(/\r?\n/);
    pending = parts.pop();
    for (const line of parts) {
      lines.push(line);
      events.emit('line', line);
    }
  }
  pending += decoder.end();
  if (pending !== '') {
    lines.push(pending);
    events.emit('line', pending);
  }
  return lines;
}

assert.deepEqual(parseOptions(['--input', 'datos.txt'], { LINE_LIMIT: '2' }), {
  input: 'datos.txt',
  limit: 2,
});
assert.deepEqual(parseOptions(['--limit', '3', '--input', 'datos.txt'], {}), {
  input: 'datos.txt',
  limit: 3,
});
assert.throws(() => parseOptions('--input datos.txt'), /argv debe ser un array/);
assert.throws(() => parseOptions(['--input'], {}), TypeError);
assert.throws(() => parseOptions(['--input', 'datos.txt', '--limit', '0'], {}), RangeError);
assert.equal(
  await readText(new URL(import.meta.url)).then((text) => text.includes('collectLines')),
  true,
);
assert.equal(
  await readText(new URL(import.meta.url).href).then((text) => text.includes('collectLines')),
  true,
);
await assert.rejects(() => readText(new URL('.', import.meta.url)), TypeError);
const input = new PassThrough();
const events = new EventEmitter();
const observed = [];
events.on('line', (line) => observed.push(line));
input.write(Buffer.from('mate\nca', 'utf8'));
input.write(Buffer.from([0x66, 0xc3]));
input.end(Buffer.from([0xa9, 0x0a, 0x66, 0x69, 0x6e, 0x61, 0x6c]));
assert.deepEqual(await collectLines(input, events), ['mate', 'café', 'final']);
assert.deepEqual(observed, ['mate', 'café', 'final']);
