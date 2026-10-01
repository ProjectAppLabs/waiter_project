import { change, presetSpan, toCsv, validSpan } from '@/lib/domain/business'

const NOW = new Date(2026, 9, 1, 15, 0) // jueves 1 de octubre de 2026

// Falla si los periodos del resumen no empiezan el lunes, el día 1 o el mes anterior completo.
it('arma los periodos de consulta', () => {
  expect(presetSpan('today', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-01' })
  expect(presetSpan('week', NOW)).toEqual({ from: '2026-09-28', to: '2026-10-01' })
  expect(presetSpan('month', NOW)).toEqual({ from: '2026-10-01', to: '2026-10-01' })
  expect(presetSpan('lastMonth', NOW)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
  expect(presetSpan('last30', NOW)).toEqual({ from: '2026-09-02', to: '2026-10-01' })
  expect(validSpan({ from: '2026-10-02', to: '2026-10-01' })).toBe(false)
})

// Falla si la variación divide por cero o se calcula al revés.
it('calcula la variación frente al periodo anterior', () => {
  expect(change(120, 100)).toBe(20)
  expect(change(80, 100)).toBe(-20)
  expect(change(50, 0)).toBeNull()
})

// Falla si el CSV no abre bien en Excel en español: separador «;», coma decimal y comillas en las celdas que lo piden.
it('exporta un CSV legible en Excel', () => {
  expect(toCsv(['Sede', 'Ventas'], [['Poblado; centro', 1234.5], ['Laureles', null]])).toBe('Sede;Ventas\r\n"Poblado; centro";1234,5\r\nLaureles;')
})
