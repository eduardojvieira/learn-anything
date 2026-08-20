import assert from 'node:assert/strict';

/** @param {string[]} nodes @param {{ from: string, to: string, cost: number }[]} edges */
export function shortestRoute(nodes, edges, start, goal) {
  if (!Array.isArray(nodes) || !Array.isArray(edges))
    throw new TypeError('nodes y edges deben ser arrays');
  const known = new Set(nodes);
  if (known.size !== nodes.length || nodes.some((node) => typeof node !== 'string' || node === ''))
    throw new TypeError('nodes debe contener strings únicos no vacíos');
  if (!known.has(start) || !known.has(goal))
    throw new RangeError('start y goal deben existir en nodes');

  const graph = new Map(nodes.map((node) => [node, []]));
  for (const edge of edges) {
    if (
      edge === null ||
      typeof edge !== 'object' ||
      !known.has(edge.from) ||
      !known.has(edge.to) ||
      !Number.isSafeInteger(edge.cost) ||
      edge.cost <= 0
    )
      throw new TypeError('cada arista debe unir nodos conocidos con costo entero positivo seguro');
    graph.get(edge.from).push(edge);
  }

  const heap = [];
  const comparePath = (left, right) => {
    for (let index = 0; index < Math.min(left.length, right.length); index++) {
      if (left[index] < right[index]) return -1;
      if (left[index] > right[index]) return 1;
    }
    return left.length - right.length;
  };
  const less = (a, b) => a.cost < b.cost || (a.cost === b.cost && comparePath(a.path, b.path) < 0);
  const push = (item) => {
    heap.push(item);
    for (let child = heap.length - 1; child > 0; ) {
      const parent = Math.floor((child - 1) / 2);
      if (!less(heap[child], heap[parent])) break;
      [heap[child], heap[parent]] = [heap[parent], heap[child]];
      child = parent;
    }
  };
  const pop = () => {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      for (let parent = 0; ; ) {
        const left = parent * 2 + 1;
        const right = left + 1;
        let smallest = parent;
        if (left < heap.length && less(heap[left], heap[smallest])) smallest = left;
        if (right < heap.length && less(heap[right], heap[smallest])) smallest = right;
        if (smallest === parent) break;
        [heap[parent], heap[smallest]] = [heap[smallest], heap[parent]];
        parent = smallest;
      }
    }
    return first;
  };

  const best = new Map([[start, { cost: 0, path: [start] }]]);
  push(best.get(start));
  while (heap.length > 0) {
    const current = pop();
    const node = current.path.at(-1);
    if (best.get(node) !== current) continue;
    if (node === goal) return { cost: current.cost, path: current.path };
    for (const { to, cost } of graph.get(node)) {
      const path = [...current.path, to];
      const total = current.cost + cost;
      if (!Number.isSafeInteger(total))
        throw new RangeError('el costo total excede el entero seguro');
      const candidate = { cost: total, path };
      const previous = best.get(to);
      if (!previous || less(candidate, previous)) {
        best.set(to, candidate);
        push(candidate);
      }
    }
  }
  return null;
}

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
assert.deepEqual(
  shortestRoute(
    ['a', 'b', 'c', 'd'],
    [
      { from: 'a', to: 'c', cost: 1 },
      { from: 'c', to: 'd', cost: 2 },
      { from: 'a', to: 'b', cost: 1 },
      { from: 'b', to: 'd', cost: 2 },
    ],
    'a',
    'd',
  ),
  { cost: 3, path: ['a', 'b', 'd'] },
);
assert.deepEqual(shortestRoute(nodes, edges, 'api', 'api'), { cost: 0, path: ['api'] });
assert.equal(shortestRoute(nodes, edges, 'db', 'api'), null);
for (const bad of [
  () => shortestRoute(['a', 'a'], [], 'a', 'a'),
  () => shortestRoute(['a'], [{ from: 'a', to: 'b', cost: 1 }], 'a', 'a'),
  () => shortestRoute(['a'], [{ from: 'a', to: 'a', cost: 0 }], 'a', 'a'),
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
  () => shortestRoute(['a'], [], 'a', 'b'),
])
  assert.throws(bad);
