import type { OutboxEntry } from '@/lib/offline/outbox'

// Plan V: el arqueo provisional de la caja sin conexión. Parte del efectivo esperado que el servidor dijo la última
// vez (o de la base de apertura) y suma lo que se hizo sin red: cobros en efectivo, entradas y salidas. El cierre formal
// se hace al volver la red; esto es para contar el cajón y saber cuánto debería haber.
export interface ProvisionalCount {
  base: number; cashSales: number; otherSales: number; cashIn: number; cashOut: number; expected: number; payments: number
}

export function provisionalCount(base: number, entries: OutboxEntry[], shiftId: number | null): ProvisionalCount {
  let cashSales = 0, otherSales = 0, cashIn = 0, cashOut = 0, payments = 0
  for (const e of entries) {
    if (e.kind === 'payment') {
      payments += 1
      const amount = typeof e.amount === 'number' ? e.amount : e.expected ?? 0
      if (e.cash) cashSales += amount; else otherSales += amount
    } else if (e.kind === 'cash_move' && (shiftId === null || e.shiftId === shiftId)) {
      if (e.type === 'in') cashIn += e.amount; else cashOut += e.amount
    }
  }
  return { base, cashSales, otherSales, cashIn, cashOut, payments, expected: base + cashSales + cashIn - cashOut }
}
