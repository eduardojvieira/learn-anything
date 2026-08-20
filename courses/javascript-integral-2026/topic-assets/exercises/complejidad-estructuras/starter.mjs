import assert from 'node:assert/strict';

/**
 * Devuelve la ruta de menor costo desde start hasta goal en un grafo dirigido.
 * nodes es un array de strings únicos; edges contiene { from, to, cost } con costo positivo seguro.
 * Si no hay ruta devuelve null. En empates de costo, elegí la ruta lexicográficamente menor.
 * Fail-closed: si cualquier costo acumulado deja de ser entero seguro, lanzá RangeError aun si esa rama no llega a goal.
 * @param {string[]} nodes
 * @param {{ from: string, to: string, cost: number }[]} edges
 * @param {string} start
 * @param {string} goal
 */
export function shortestRoute(nodes, edges, start, goal) {
  // TODO: validar el contrato, construir la lista de adyacencia y usar un min-heap con Dijkstra.
}

// RED inicialmente: implementá hasta GREEN; solution.mjs es referencia posterior.
const nodes = ['api', 'auth', 'cache', 'db', 'queue'];
const edges = [
  { from: 'api', to: 'auth', cost: 2 },
  { from: 'api', to: 'cache', cost: 1 },
  { from: 'cache', to: 'auth', cost: 1 },
  { from: 'auth', to: 'db', cost: 3 },
  { from: 'cache', to: 'queue', cost: 2 },
  { from: 'queue', to: 'db', cost: 1 },
];
assert.deepEqual(shortestRoute(nodes, edges, 'api', 'db'), {
  cost: 4,
  path: ['api', 'cache', 'queue', 'db'],
});
assert.equal(shortestRoute(nodes, edges, 'db', 'api'), null);
assert.throws(() => shortestRoute(['a', 'a'], [], 'a', 'a'), TypeError);
assert.throws(
  () =>
    shortestRoute(
      ['a', 'b', 'c', 'goal'],
      [
        { from: 'a', to: 'b', cost: Number.MAX_SAFE_INTEGER },
        { from: 'b', to: 'c', cost: 1 },
      ],
      'a',
      'goal',
    ),
  RangeError,
);
