import assert from 'node:assert/strict';

/** Devuelve los pasos de una build según un contrato de herramientas explícito. */
export function buildPlan(config) {
  // TODO: validar config y separar desarrollo de producción.
}

/** Cambia sólo identificadores de un AST mínimo y devuelve un árbol nuevo. */
export function renameIdentifier(node, from, to) {
  // TODO: recorrer Identifier, CallExpression y Program sin mutar node.
}

/** Genera JavaScript para el AST mínimo que usa este laboratorio. */
export function generate(node) {
  // TODO: convertir Program, ExpressionStatement, CallExpression e Identifier.
}

const development = buildPlan({ entry: 'src/main.js', mode: 'development' });
assert.deepEqual(development, {
  steps: ['format:check', 'lint', 'transpile', 'bundle', 'source-map'],
  typeCheck: 'checkJs',
});
assert.deepEqual(buildPlan({ entry: 'src/main.js', mode: 'production' }).steps, [
  'format:check',
  'lint',
  'transpile',
  'bundle',
  'tree-shake',
  'minify',
]);

const input = {
  type: 'Program',
  body: [
    {
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        callee: { type: 'Identifier', name: 'debug' },
        arguments: [{ type: 'Identifier', name: 'value' }],
      },
    },
  ],
};
const output = renameIdentifier(input, 'debug', 'log');
assert.equal(generate(output), 'log(value);');
assert.equal(generate(input), 'debug(value);');
assert.throws(() => buildPlan({ entry: '', mode: 'development' }), TypeError);
assert.throws(() => renameIdentifier(input, '', 'log'), TypeError);
assert.throws(() => renameIdentifier(input, 'debug', 'await'), TypeError);
assert.throws(() => generate({ type: 'Identifier', name: '1bad' }), TypeError);
