import { lastBookableDay, noticeLabel, copyDay, dayKeyOf, isClosedOn, rangesError, rangesFor, removeOverride, scheduleError, suggestRange, upsertOverride, weekSpan, type Range, type Schedule } from '@/lib/domain/reservationHours'

const week = (ranges: Range[]): Schedule => ({ weekly: { 0: ranges, 1: ranges, 2: ranges, 3: ranges, 4: ranges, 5: ranges, 6: [] }, overrides: [], rules: { minNotice: 0, maxDays: 0 } })

// Falla si el día de la semana deja de contarse desde el lunes (el servidor usa date.weekday()): el calendario
// cerraría el día equivocado.
it('counts weekdays from Monday like the server does', () => {
  expect(dayKeyOf('2026-09-21')).toBe('0') // lunes
  expect(dayKeyOf('2026-09-20')).toBe('6') // domingo
  expect(isClosedOn(week([[12, 15]]), '2026-09-20')).toBe(true)
  expect(isClosedOn(week([[12, 15]]), '2026-09-21')).toBe(false)
})

// Falla si una fecha especial deja de mandar sobre su día de la semana, en los dos sentidos.
it('lets a special date replace its weekday', () => {
  let s = upsertOverride(week([[12, 15]]), { date: '2026-09-21', ranges: [], note: 'Festivo' })
  s = upsertOverride(s, { date: '2026-09-20', ranges: [[18, 22]], note: 'Evento' })
  expect(rangesFor(s, '2026-09-21')).toEqual([])
  expect(rangesFor(s, '2026-09-20')).toEqual([[18, 22]])
  expect(s.overrides.map((o) => o.date)).toEqual(['2026-09-20', '2026-09-21'])
  s = upsertOverride(s, { date: '2026-09-21', ranges: [[10, 11]], note: '' })
  expect(s.overrides).toHaveLength(2)
  expect(rangesFor(removeOverride(s, '2026-09-21'), '2026-09-21')).toEqual([[12, 15]])
})

// Falla si el editor deja guardar franjas que el servidor va a rechazar.
it('names what is wrong with a day', () => {
  expect(rangesError([[12, 15], [18, 22]])).toBeNull()
  expect(rangesError([[12, 15], [15, 22]])).toBeNull() // pegadas sí; pisadas no
  expect(rangesError([[15, 12]])).toBe('order')
  expect(rangesError([[12, 15], [14, 18]])).toBe('overlap')
  expect(rangesError([[1, 2], [3, 4], [5, 6], [7, 8], [9, 10]])).toBe('tooMany')
  expect(scheduleError({ ...week([[12, 15]]), overrides: [{ date: '2026-12-24', ranges: [[20, 19]], note: '' }] })).toEqual({ where: '2026-12-24', error: 'order' })
})

// Falla si «Agregar franja» propone una franja pisada o fuera del día.
it('suggests the next range after the last one and stops when the day is full', () => {
  expect(suggestRange([])).toEqual([12, 15])
  expect(suggestRange([[12, 15]])).toEqual([16, 19])
  expect(suggestRange([[12, 22.5]])).toEqual([23.5, 24])
  expect(suggestRange([[12, 23.5]])).toBeNull()
  expect(suggestRange([[1, 2], [3, 4], [5, 6], [7, 8]])).toBeNull()
})

// Falla si copiar un día comparte las mismas franjas por referencia (editar el lunes cambiaría el martes).
it('copies a day to others without sharing the ranges', () => {
  const s = copyDay(week([[12, 15]]), '0', ['6'])
  expect(s.weekly['6']).toEqual([[12, 15]])
  expect(s.weekly['6'][0]).not.toBe(s.weekly['0'][0])
  expect(weekSpan(s)).toEqual([11, 16])
})

// Falla si la antelación se rotula mal en el editor o si la ventana máxima deja de caer en el día correcto (cruce de mes).
it('labels the notice and finds the last bookable day', () => {
  expect([30, 90, 1440, 2880].map(noticeLabel)).toEqual(['30 min', '1 h 30 min', '1 día', '2 días'])
  expect(lastBookableDay({ minNotice: 0, maxDays: 0 }, '2026-09-20')).toBeNull()
  expect(lastBookableDay({ minNotice: 0, maxDays: 15 }, '2026-09-20')).toBe('2026-10-05')
})
