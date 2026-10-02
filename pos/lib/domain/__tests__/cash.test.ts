import { cashDifference, needsNote } from '@/lib/domain/cash'

// Falla si un faltante se pinta como sobrante, o si una diferencia de monedas se marca como problema.
it('grades the counted cash against the expected amount', () => {
  expect(cashDifference(100000, 100300)).toEqual({ amount: 300, tone: 'ok' })
  expect(cashDifference(100000, 90000)).toEqual({ amount: -10000, tone: 'busy' })
  expect(cashDifference(100000, 112000)).toEqual({ amount: 12000, tone: 'warn' })
})

// Falla si una caja que no cuadra (faltante o sobrante) se deja cerrar sin nota, o si una que cuadra la exige (plan Q).
it('pide la nota solo cuando la caja no cuadra', () => {
  expect(needsNote(100000, 88000, '')).toBe(true)
  expect(needsNote(100000, 101000, '   ')).toBe(true)
  expect(needsNote(100000, 88000, 'Faltó un billete')).toBe(false)
  expect(needsNote(100000, 100000, '')).toBe(false)
  expect(needsNote(100000, null, '')).toBe(false)
  expect(cashDifference(100000, 98500, 2000).tone).toBe('ok')
})
