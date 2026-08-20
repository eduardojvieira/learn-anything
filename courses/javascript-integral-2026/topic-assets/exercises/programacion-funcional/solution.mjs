import assert from 'node:assert/strict';

export const pipe =
  (...pasos) =>
  (valor) =>
    pasos.reduce((actual, paso) => paso(actual), valor);

export const aplicarIva = (tasa) => (importe) => importe * (1 + tasa);

export const resumirPedidosPagos = (pedidos) =>
  pedidos
    .filter((pedido) => pedido.estado === 'pagado')
    .flatMap((pedido) => pedido.items)
    .reduce(
      (resumen, item) => {
        const total = item.precio * item.cantidad;
        return {
          lineas: resumen.lineas + 1,
          facturacion: resumen.facturacion + total,
          porCategoria: {
            ...resumen.porCategoria,
            [item.categoria]: (resumen.porCategoria[item.categoria] ?? 0) + total,
          },
        };
      },
      { lineas: 0, facturacion: 0, porCategoria: {} },
    );

const pedidos = Object.freeze([
  Object.freeze({
    estado: 'pagado',
    items: Object.freeze([Object.freeze({ categoria: 'libros', precio: 10, cantidad: 2 })]),
  }),
  Object.freeze({
    estado: 'pendiente',
    items: Object.freeze([Object.freeze({ categoria: 'libros', precio: 99, cantidad: 1 })]),
  }),
  Object.freeze({
    estado: 'pagado',
    items: Object.freeze([
      Object.freeze({ categoria: 'libros', precio: 5, cantidad: 2 }),
      Object.freeze({ categoria: 'papeleria', precio: 3, cantidad: 1 }),
    ]),
  }),
]);
const antes = JSON.stringify(pedidos);
assert.equal(aplicarIva(0.21)(100), 121);
assert.equal(
  pipe(
    (n) => n + 1,
    (n) => n * 2,
  )(3),
  8,
);
const resumen = resumirPedidosPagos(pedidos);
assert.deepEqual(resumen, {
  lineas: 3,
  facturacion: 33,
  porCategoria: { libros: 30, papeleria: 3 },
});
assert.deepEqual(resumirPedidosPagos([]), { lineas: 0, facturacion: 0, porCategoria: {} });
assert.notStrictEqual(resumen.porCategoria, resumirPedidosPagos(pedidos).porCategoria);
assert.equal(JSON.stringify(pedidos), antes);
