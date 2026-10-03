import { allocate, allocated, everything, lineAmount, refundTotal } from '@/lib/domain/refund'
import type { RefundableLine, RefundableMethod } from '@/lib/services/core/refunds'

const burger: RefundableLine = { line_id: 1, name: 'Hamburguesa', qty: 3, refundable_qty: 3, unit_amount: 12966.67, refundable_amount: 38900 }
const soda: RefundableLine = { line_id: 2, name: 'Gaseosa', qty: 1, refundable_qty: 0, unit_amount: 7900, refundable_amount: 0 }
const methods: RefundableMethod[] = [
  { method_id: 2, name: 'Tarjeta', type: 'bank', paid: 30000, refundable: 30000 },
  { method_id: 1, name: 'Efectivo', type: 'cash', paid: 20000, refundable: 15000 },
]

// Falla si devolver todo lo que queda de una línea deja pesos sueltos por redondeo, o si una parte no va por unidad.
it('valor de una línea', () => {
  expect(lineAmount(burger, 3)).toBe(38900)
  expect(lineAmount(burger, 1)).toBe(12967)
  expect(lineAmount(burger, 0)).toBe(0)
  expect(refundTotal([burger, soda], { 1: 2 }, 2000)).toBe(25933 + 2000)
})

// Falla si «devolver todo» incluye líneas ya devueltas del todo.
it('todo lo devolvible', () => {
  expect(everything([burger, soda])).toEqual({ 1: 3 })
})

// Falla si el reparto no empieza por el efectivo, pasa de lo devolvible de un método o no suma el total.
it('reparte primero en efectivo sin pasar de cada método', () => {
  const payments = allocate(40000, methods)
  expect(payments).toEqual({ 1: 15000, 2: 25000 })
  expect(allocated(payments)).toBe(40000)
  expect(allocated(allocate(60000, methods))).toBe(45000)
})
