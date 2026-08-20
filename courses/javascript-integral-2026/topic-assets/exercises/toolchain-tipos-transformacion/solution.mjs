import assert from 'node:assert/strict';

const identifierPattern = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const reservedIdentifiers = new Set([
  'await',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'implements',
  'import',
  'in',
  'instanceof',
  'interface',
  'let',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'return',
  'static',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
]);

function assertIdentifier(name, label = 'Identifier.name') {
  if (typeof name !== 'string' || !identifierPattern.test(name) || reservedIdentifiers.has(name))
    throw new TypeError(`${label} debe ser un identificador ASCII no reservado`);
}

/** Devuelve los pasos de una build según un contrato de herramientas explícito. */
export function buildPlan(config) {
  if (config === null || typeof config !== 'object')
    throw new TypeError('config debe ser un objeto');
  const { entry, mode, typeCheck = 'checkJs' } = config;
  if (typeof entry !== 'string' || entry.trim() === '')
    throw new TypeError('entry debe ser texto no vacío');
  if (!['development', 'production'].includes(mode)) throw new TypeError('mode inválido');
  if (!['checkJs', 'typescript', 'none'].includes(typeCheck))
    throw new TypeError('typeCheck inválido');
  const steps = ['format:check', 'lint', 'transpile', 'bundle'];
  if (mode === 'production') steps.push('tree-shake', 'minify');
  else steps.push('source-map');
  return { steps, typeCheck };
}

/** Cambia sólo identificadores de un AST mínimo y devuelve un árbol nuevo. */
export function renameIdentifier(node, from, to) {
  assertIdentifier(from, 'from');
  assertIdentifier(to, 'to');
  if (node === null || typeof node !== 'object') throw new TypeError('node debe ser un AST');
  switch (node.type) {
    case 'Identifier':
      assertIdentifier(node.name);
      return { ...node, name: node.name === from ? to : node.name };
    case 'Program':
      return { ...node, body: node.body.map((child) => renameIdentifier(child, from, to)) };
    case 'ExpressionStatement':
      return { ...node, expression: renameIdentifier(node.expression, from, to) };
    case 'CallExpression':
      return {
        ...node,
        callee: renameIdentifier(node.callee, from, to),
        arguments: node.arguments.map((child) => renameIdentifier(child, from, to)),
      };
    default:
      throw new TypeError(`nodo no soportado: ${node.type}`);
  }
}

/** Genera JavaScript para el AST mínimo que usa este laboratorio. */
export function generate(node) {
  if (node === null || typeof node !== 'object') throw new TypeError('node debe ser un AST');
  switch (node.type) {
    case 'Identifier':
      assertIdentifier(node.name);
      return node.name;
    case 'Program':
      return node.body.map(generate).join('\n');
    case 'ExpressionStatement':
      return `${generate(node.expression)};`;
    case 'CallExpression':
      return `${generate(node.callee)}(${node.arguments.map(generate).join(', ')})`;
    default:
      throw new TypeError(`nodo no soportado: ${node.type}`);
  }
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
assert.equal(
  buildPlan({ entry: 'src/main.ts', mode: 'production', typeCheck: 'typescript' }).typeCheck,
  'typescript',
);
assert.throws(() => buildPlan({ entry: '', mode: 'development' }), TypeError);
assert.throws(() => buildPlan({ entry: 'src/main.js', mode: 'test' }), TypeError);

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
assert.notEqual(output, input);
assert.throws(() => renameIdentifier(input, '', 'log'), TypeError);
assert.throws(() => renameIdentifier(input, 'debug', 'await'), TypeError);
assert.throws(() => renameIdentifier({ type: 'Identifier', name: '1bad' }, 'ok', 'log'), TypeError);
assert.throws(() => generate({ type: 'Identifier', name: '1bad' }), TypeError);
assert.throws(() => generate({ type: 'Identifier', name: 'yield' }), TypeError);
assert.throws(() => generate({ type: 'Literal', value: 1 }), TypeError);
