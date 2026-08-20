import assert from 'node:assert/strict';

/** Aplicá cada paso al valor, de izquierda a derecha. */
export const pipe =
  (...pasos) =>
  (valor) => {
    // TODO: reducí pasos sobre valor.
  };

/** Devolvé una función que aplique la tasa al importe. */
export const aplicarIva = (tasa) => {
  // TODO: devolvé (importe) => ...
};

/** No muta pedidos ni items; retorna { lineas, facturacion, porCategoria }. */
export const resumirPedidosPagos = (pedidos) => {
  // TODO: filtrá pagados, aplaná items y resumí importes por categoría.
};

// RED inicialmente: estos asserts describen el contrato a implementar.
const pedidos = Object.freeze([
  Object.freeze({
    estado: 'pagado',
    items: Object.freeze([
      Object.freeze({ categoria: 'libros', precio: 10, cantidad: 2 }),
      Object.freeze({ categoria: 'papeleria', precio: 3, cantidad: 1 }),
    ]),
  }),
  Object.freeze({
    estado: 'pendiente',
    items: Object.freeze([Object.freeze({ categoria: 'libros', precio: 99, cantidad: 1 })]),
  }),
]);
assert.equal(aplicarIva(0.21)(100), 121);
assert.equal(
  pipe(
    (n) => n + 1,
    (n) => n * 2,
  )(3),
  8,
);
assert.deepEqual(resumirPedidosPagos(pedidos), {
  lineas: 2,
  facturacion: 23,
  porCategoria: { libros: 20, papeleria: 3 },
});
