import { formatElapsed, formatHour, fromOdooDatetime, readStoredEmployee, shiftLabel, storeEmployee, toShift } from '@/lib/domain/employees'

// Falla si el empleado activo no se recuerda en el dispositivo o si un valor corrupto rompe la lectura.
it('remembers the active employee on the device and survives corrupt storage', () => {
  localStorage.clear()
  expect(readStoredEmployee()).toBeNull()
  storeEmployee({ id: 2, checkIn: '2026-09-06T10:00:00.000Z', token: 'tok-demo' })
  expect(readStoredEmployee()).toEqual({ id: 2, checkIn: '2026-09-06T10:00:00.000Z', token: 'tok-demo', sessionEnds: null })
  localStorage.setItem('waiter.employee', '{bad')
  expect(readStoredEmployee()).toBeNull()
  storeEmployee(null)
  expect(localStorage.getItem('waiter.employee')).toBeNull()
})

// Falla si un empleado sin horario (shift_start/shift_end vacíos en Odoo) no cae en "Sin horario".
it('toShift reads the decimal hours of hr.employee and treats 0–0 as no shift', () => {
  expect(toShift(8, 16)).toEqual({ from: 8, to: 16 })
  expect(toShift(false, false)).toBeNull()
  expect(toShift(0, 0)).toBeNull()
  expect(shiftLabel(toShift(10.5, 22), 'Sin horario')).toBe('10:30 a. m. – 10:00 p. m.')
  expect(shiftLabel(null, 'Sin horario')).toBe('Sin horario')
})

// Falla si las horas decimales de Odoo o el cronómetro se formatean mal.
it('formats hours, elapsed time and parses Odoo UTC datetimes', () => {
  expect(formatHour(10.5)).toBe('10:30 a. m.')
  expect(formatHour(0)).toBe('12:00 a. m.')
  expect(formatElapsed(4 * 3600_000 + 25 * 60_000 + 32_000)).toBe('04:25:32')
  expect(formatElapsed(-5)).toBe('00:00:00')
  expect(fromOdooDatetime('2026-09-06 10:00:00').toISOString()).toBe('2026-09-06T10:00:00.000Z')
})

