import { rangeFor, utcBounds, validRange } from '@/lib/domain/salesPeriod'

// Falla si «esta semana» deja de empezar en lunes, si «este mes» o «mes pasado» se corren (incluido el cruce de año), o
// si un domingo —fin de la semana— se toma como inicio de la siguiente.
it('turns each period into local days', () => {
  expect(rangeFor('today', '2026-09-20')).toEqual({ from: '2026-09-20', to: '2026-09-20' })
  expect(rangeFor('yesterday', '2026-09-01')).toEqual({ from: '2026-08-31', to: '2026-08-31' })
  expect(rangeFor('week', '2026-09-20')).toEqual({ from: '2026-09-14', to: '2026-09-20' }) // domingo
  expect(rangeFor('week', '2026-09-21')).toEqual({ from: '2026-09-21', to: '2026-09-21' }) // lunes
  expect(rangeFor('month', '2026-09-20')).toEqual({ from: '2026-09-01', to: '2026-09-20' })
  expect(rangeFor('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  expect(rangeFor('lastMonth', '2026-03-31')).toEqual({ from: '2026-02-01', to: '2026-02-28' })
})

// Falla si se acepta un rango al revés, a medio escribir o de varios años.
it('accepts only ordered ranges of at most a year', () => {
  expect(validRange({ from: '2026-09-01', to: '2026-09-20' })).toBe(true)
  expect(validRange({ from: '2026-09-20', to: '2026-09-01' })).toBe(false)
  expect(validRange({ from: '', to: '2026-09-01' })).toBe(false)
  expect(validRange({ from: '2024-01-01', to: '2026-09-01' })).toBe(false)
})

// Falla si el último día del rango deja de incluirse entero: el límite superior es la medianoche del día SIGUIENTE.
it('covers whole local days, last one included', () => {
  const [from, to] = utcBounds({ from: '2026-09-19', to: '2026-09-20' })
  expect(new Date(from.replace(' ', 'T') + 'Z').getTime()).toBe(new Date('2026-09-19T00:00:00').getTime())
  expect(new Date(to.replace(' ', 'T') + 'Z').getTime()).toBe(new Date('2026-09-21T00:00:00').getTime())
})
