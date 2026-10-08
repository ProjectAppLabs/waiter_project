import { cartAmounts, finalLineTotal, finalUnitPrice, type CartAmountTax } from '@/lib/domain/cartAmounts'

const excluded: CartAmountTax = { id: 1, amount: 19, priceInclude: false }
const included: CartAmountTax = { id: 2, amount: 8, priceInclude: true }

// Falla si se vuelve a añadir el impuesto excluido al precio final o si los incluidos múltiples no comparten base.
it.each([
  ['sin impuestos', 10000, [], { subtotal: 10000, tax: 0, total: 10000 }],
  ['19 % excluido', 11900, [excluded], { subtotal: 10000, tax: 1900, total: 11900 }],
  ['8 % incluido', 10800, [included], { subtotal: 10000, tax: 800, total: 10800 }],
  ['19 % y 8 % incluidos', 12700, [{ ...excluded, priceInclude: true }, included], { subtotal: 10000, tax: 2700, total: 12700 }],
  ['19 % excluido y 8 % incluido', 12852, [excluded, included], { subtotal: 10000, tax: 2852, total: 12852 }],
] as const)('descompone el precio final: %s', (_name, unitPrice, taxes, expected) => {
  expect(cartAmounts([{ unitPrice, qty: 1, taxIds: taxes.map((tax) => tax.id) }], taxes)).toEqual(expected)
})

// Falla si se grava de nuevo una adición o si el redondeo por línea pierde centavos del contrato de ventas.
it('suma sobreprecios al precio final antes de descomponer la línea', () => {
  expect(cartAmounts([{ unitPrice: 11900, extras: [1500, 500], qty: 2, taxIds: [1] }], [excluded]))
    .toEqual({ subtotal: 23361.34, tax: 4438.66, total: 27800 })
  expect(finalUnitPrice(11900, [1500, 500])).toBe(13900)
})

// Falla si HALF_UP se aplica después de multiplicar, si 1.005 baja por coma flotante o si se redondea toda la cesta.
it('redondea la unidad y cada línea a centavos antes de sumarlas', () => {
  const lines = [
    { unitPrice: 1.005, qty: 3, taxIds: [] },
    { unitPrice: 0.335, qty: 1, taxIds: [] },
    { unitPrice: 0.335, qty: 1, taxIds: [] },
  ]
  expect(finalLineTotal(lines[0])).toBe(3.03)
  expect(cartAmounts(lines, [])).toEqual({ subtotal: 3.71, tax: 0, total: 3.71 })
  expect(finalUnitPrice(0.1, [0.2, 0.005])).toBe(0.31)
})

// Falla si las cantidades fraccionarias o los importes pequeños en notación exponencial pierden el redondeo decimal.
it('conserva cantidades fraccionarias y decimales pequeños', () => {
  expect(cartAmounts([{ unitPrice: 11900, qty: 1.5, taxIds: [1] }], [excluded]))
    .toEqual({ subtotal: 15000, tax: 2850, total: 17850 })
  expect(finalUnitPrice(1e-7, [0.0049999])).toBe(0.01)
})

// Falla si una tasa ajena al plato altera su base o si un carrito vacío inventa importes.
it('usa sólo las tasas del plato y mantiene vacío el carrito vacío', () => {
  expect(cartAmounts([{ unitPrice: 11900, qty: 1, taxIds: [1] }], [excluded, included]))
    .toEqual({ subtotal: 10000, tax: 1900, total: 11900 })
  expect(cartAmounts([], [excluded])).toEqual({ subtotal: 0, tax: 0, total: 0 })
})
