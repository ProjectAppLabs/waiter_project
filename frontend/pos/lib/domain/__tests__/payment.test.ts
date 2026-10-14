import { canSettle, change, remaining, splitEqual, suggestedTip } from '@/lib/domain/payment'

const cash = (amount: number, received = amount) => ({ methodId: 1, type: 'cash' as const, amount, received, reference: '' })
const card = (amount: number) => ({ methodId: 2, type: 'bank' as const, amount, received: amount, reference: '' })

// Falla si dividir en partes pierde o inventa pesos por redondeo.
it('splits a bill into equal parts that add up exactly', () => {
  expect(splitEqual(100000, 3)).toEqual([33333, 33333, 33334])
  expect(splitEqual(87822, 1)).toEqual([87822])
})

// Falla si la propina sugerida no es el 10 % redondeado.
it('suggests a rounded 10 percent tip', () => {
  expect(suggestedTip(87822)).toBe(8782)
})

// Falla si un pago mixto no cierra en cero, si el cambio sale del datáfono, o si se cobra con efectivo insuficiente.
it('tracks remaining, change and readiness across mixed payments', () => {
  const payments = [card(50000), cash(37822, 40000)]
  expect(remaining(87822, payments)).toBe(0)
  expect(change(payments)).toBe(2178)
  expect(canSettle(87822, payments)).toBe(true)
  expect(canSettle(87822, [cash(87822, 80000)])).toBe(false)
  expect(canSettle(87822, [card(50000)])).toBe(false)
})
