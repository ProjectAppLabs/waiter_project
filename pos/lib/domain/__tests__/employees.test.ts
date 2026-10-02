import { clearStoredEmployee, formatElapsed, formatHour, shiftLabel } from '@/lib/domain/employees'
// Falla si cerrar sesión conserva una identidad antigua en el dispositivo.
it('limpia la identidad guardada', () => {
 localStorage.setItem('waiter.employee', '{"id":2}')
 clearStoredEmployee()
 expect(localStorage.getItem('waiter.employee')).toBeNull()
})
// Falla si el horario decimal o la ausencia de horario se muestran mal.
it('formatea el horario de la persona', () => {
 expect(shiftLabel({ from: 10.5, to: 22 }, 'Sin horario')).toBe('10:30 a. m. – 10:00 p. m.')
 expect(shiftLabel(null, 'Sin horario')).toBe('Sin horario')
})
// Falla si el cronómetro produce horas negativas o pierde minutos y segundos.
it('formatea horas y tiempo transcurrido', () => {
 expect(formatHour(10.5)).toBe('10:30 a. m.')
 expect(formatHour(0)).toBe('12:00 a. m.')
 expect(formatElapsed(4 * 3600_000 + 25 * 60_000 + 32_000)).toBe('04:25:32')
 expect(formatElapsed(-5)).toBe('00:00:00')
})
