import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

/** Valida --input y un límite de CLI o entorno para una CLI de archivos. */
export function parseOptions(argv, env = process.env) {
  // TODO
}

/** Lee UTF-8 desde un path o file: URL, sin aceptar directorios. */
export async function readText(location) {
  // TODO
}

/** Une líneas partidas entre chunks y notifica cada línea completa. */
export async function collectLines(readable, events = new EventEmitter()) {
  // TODO
}

assert.fail('Completá los TODO de node-procesos-io');
