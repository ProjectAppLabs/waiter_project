import { appendDigit, backspace, canPayCash, cashChange, formatCountdown, methodFor, pointsDiscount, pointsToRedeem } from '@/lib/domain/paymentKit'
import type { PaymentMethod } from '@/lib/types'

const methods: PaymentMethod[] = [{ id: 2, name: 'Tarjeta', type: 'bank' }, { id: 3, name: 'Cuenta de cliente', type: 'pay_later' }, { id: 1, name: 'Efectivo', type: 'cash' }, { id: 7, name: 'QR (demo)', type: 'bank' }]

// Falla si el display del efectivo acepta ceros a la izquierda o crece sin tope.
it('cash display appends digits without leading zeros and caps at nine digits', () => {
  expect(appendDigit('0', '5')).toBe('5')
  expect(appendDigit('', '0')).toBe('0')
  expect(appendDigit('12', 'x')).toBe('12')
  expect(appendDigit('123456789', '0')).toBe('123456789')
  expect(backspace('120')).toBe('12')
})

// Falla si el cambio sale negativo o si se puede cobrar con efectivo insuficiente.
it('cash change and readiness follow the received amount', () => {
  expect(cashChange(100_000, 92_582)).toBe(7_418)
  expect(cashChange(50_000, 92_582)).toBe(0)
  expect(canPayCash(92_582, 92_582)).toBe(true)
  expect(canPayCash(50_000, 92_582)).toBe(false)
  expect(canPayCash(10, 0)).toBe(false)
})

// Falla si el temporizador del kit deja de leerse "00h 24m 54s".
it('countdown formats hours, minutes and seconds', () => {
  expect(formatCountdown(24 * 60_000 + 54_000)).toBe('00h 24m 54s')
  expect(formatCountdown(-5)).toBe('00h 00m 00s')
})

// Falla si la pestaña Tarjeta toma el método QR o si QR aparece sin un método con ese nombre.
it('maps kit tabs to el servidor payment methods by type and name', () => {
  expect(methodFor('cash', methods)?.id).toBe(1)
  expect(methodFor('card', methods)?.id).toBe(2)
  expect(methodFor('qr', methods)?.id).toBe(7)
  expect(methodFor('qr', methods.slice(0, 3))).toBeNull()
})

// Falla si los puntos descuentan más de lo que falta por pagar o consumen puntos de más.
it('points discount is capped by the due amount', () => {
  expect(pointsDiscount(12_400, { copPerPoint: 10 }, 241_550)).toBe(124_000)
  expect(pointsDiscount(12_400, { copPerPoint: 10 }, 50_000)).toBe(50_000)
  expect(pointsToRedeem(50_000, { copPerPoint: 10 })).toBe(5_000)
  expect(pointsDiscount(100, { copPerPoint: 0 }, 1000)).toBe(0)
})

// Falla si el canje promete más puntos de los disponibles o acepta fracciones.
it('redeems whole points and never promises more than the server can reserve', () => {
  expect(pointsDiscount(100.9, { copPerPoint: 10 }, 5000)).toBe(1000)
  expect(pointsDiscount(200, { copPerPoint: 10 }, 1999)).toBe(1990)
  expect(pointsDiscount(100, { copPerPoint: 0.25 }, 99)).toBe(25)
})
