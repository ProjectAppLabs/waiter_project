import { guardState, IDLE_MS } from '@/lib/domain/sessionGuard'

const NOW = Date.parse('2026-10-01T21:00:00Z')

// Falla si la tablet compartida no se cierra tras 15 minutos sin uso, o si avisa antes de los últimos 5.
it('cierra por inactividad y avisa en los últimos cinco minutos', () => {
  expect(guardState(NOW, NOW - 5 * 60_000, null)).toEqual({ expired: null, warning: null, minutesLeft: 10 })
  expect(guardState(NOW, NOW - 12 * 60_000, null)).toEqual({ expired: null, warning: 'idle', minutesLeft: 3 })
  expect(guardState(NOW, NOW - IDLE_MS, null).expired).toBe('idle')
})

// Falla si el mesero sigue dentro después de su turno, o si el aviso no dice que es por el turno.
it('cierra al llegar el fin del turno, aunque esté activo', () => {
  expect(guardState(NOW, NOW, '2026-10-01T21:04:00Z')).toEqual({ expired: null, warning: 'shift', minutesLeft: 4 })
  expect(guardState(NOW, NOW, '2026-10-01T20:59:59Z').expired).toBe('shift')
})

// Falla si la cocina (sin cierre por inactividad) se cierra sola, o si sin fin de turno se cierra (dueño y encargado).
it('sin inactividad ni fin de turno no se cierra', () => {
  expect(guardState(NOW, NOW - 10 * 3_600_000, null, null)).toEqual({ expired: null, warning: null, minutesLeft: expect.any(Number) })
})
