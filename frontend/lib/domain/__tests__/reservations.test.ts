import { cardPlacement, depositMessage, depositOf, depositReady, emptyDraft, hourLabel, infoStepReady, isoDate, monthGrid, whatsappNumber, type Slot, offscreenReservations } from '@/lib/domain/reservations'

const slots: Slot[] = [10, 10.5, 11, 11.5, 12].map((time) => ({ time, label: hourLabel(time), past: false }))

// Falla si la hora decimal deja de leerse como el reloj del kit.
it('formats decimal hours like the kit clock', () => {
  expect([hourLabel(10), hourLabel(10.5), hourLabel(9.25)]).toEqual(['10:00', '10:30', '09:15'])
})

// Falla si una tarjeta se coloca en la columna equivocada o pierde el ancho de su duración.
it('places a card by start time and sizes it by duration', () => {
  expect(cardPlacement({ timeStart: 10.5, timeEnd: 11.5 }, slots)).toEqual({ index: 1, span: 2 })
  expect(cardPlacement({ timeStart: 10, timeEnd: 10.5 }, slots)).toEqual({ index: 0, span: 1 })
})

// Falla si una reserva fuera del horario se cuela en la grilla o si su ancho se sale del día.
it('drops cards outside the day and clamps the span to the last slot', () => {
  expect(cardPlacement({ timeStart: 9, timeEnd: 10 }, slots)).toBeNull()
  expect(cardPlacement({ timeStart: 11.5, timeEnd: 15 }, slots)).toEqual({ index: 3, span: 2 })
})

// Falla si el paso 1 deja continuar sin nombre, sin cuándo, o con un correo inventado.
it('requires a name, a moment and a plausible email', () => {
  const base = { ...emptyDraft(), customerName: 'Nadia', date: '2026-09-08', timeStart: 15 }
  expect(infoStepReady(base)).toBe(true)
  expect(infoStepReady({ ...base, customerName: '  ' })).toBe(false)
  expect(infoStepReady({ ...base, timeStart: null })).toBe(false)
  expect(infoStepReady({ ...base, customerEmail: 'nadia@' })).toBe(false)
  expect(infoStepReady({ ...base, customerEmail: 'nadia@correo.com' })).toBe(true)
})

// Falla si el calendario no alinea el mes a lunes: septiembre de 2026 empieza en martes.
it('builds a month grid aligned to Monday', () => {
  const grid = monthGrid(2026, 8)
  expect(grid.slice(0, 3)).toEqual([null, 1, 2])
  expect(grid.filter((d) => d !== null)).toHaveLength(30)
  expect(isoDate(2026, 8, 7)).toBe('2026-09-07')
})

// Falla si una reserva puede crearse con el costo activo pero sin valor (el cliente recibiría un enlace por cero pesos),
// si quitar el costo deja de enviar 0, o si el tope deja pasar un anticipo absurdo.
it('sends the deposit only when it is on and valid, and never an active cost of zero', () => {
  expect(emptyDraft()).toMatchObject({ depositEnabled: true, depositAmount: null })
  expect(depositReady({ depositEnabled: true, depositAmount: null })).toBe(false)
  expect(depositReady({ depositEnabled: true, depositAmount: 0 })).toBe(false)
  expect(depositReady({ depositEnabled: true, depositAmount: 50000 })).toBe(true)
  expect(depositReady({ depositEnabled: true, depositAmount: 50_000_001 })).toBe(false)
  expect(depositReady({ depositEnabled: false, depositAmount: null })).toBe(true)
  expect(depositOf({ depositEnabled: true, depositAmount: 50000 })).toBe(50000)
  expect(depositOf({ depositEnabled: false, depositAmount: 50000 })).toBe(0)
})

// Falla si el mensaje para el cliente pierde el enlace, el valor o la hora, o si WhatsApp recibe un número sin indicativo.
it('writes the share message and normalizes the WhatsApp number', () => {
  const text = depositMessage({ customerName: 'Ana María Ruiz', date: '2030-10-15', label: '19:30', people: 4, amount: 50000 }, 'Burger House', 'https://menu.test/r/abc', (n) => `$ ${n}`)
  expect(text).toContain('Hola Ana,'); expect(text).toContain('4 personas'); expect(text).toContain('a las 19:30')
  expect(text).toContain('$ 50000'); expect(text.endsWith('https://menu.test/r/abc')).toBe(true)
  expect(whatsappNumber('300 123 4567')).toBe('573001234567')
  expect(whatsappNumber('+57 300-123-4567')).toBe('573001234567')
  expect(whatsappNumber('6044440000')).toBeNull()
  expect(whatsappNumber('')).toBeNull()
})

// Falla si los globitos de la línea de tiempo dejan de avisar de lo que queda fuera de la vista: cuántas reservas hay a
// cada lado, cuál es la más cercana al borde (a la que llevan), que una reserva de grupo —repetida en la fila de cada
// mesa— cuente una sola vez, y que nada se avise cuando todo cabe.
describe('offscreenReservations', () => {
  const slots = Array.from({ length: 24 }, (_, i) => ({ time: 10 + i / 2, label: '', past: false }))
  const card = (id: number, timeStart: number) => ({ id, timeStart, timeEnd: timeStart + 1.5, label: `${timeStart}` }) as never
  const tables = [{ id: 1, reservations: [card(1, 10), card(2, 12), card(5, 15)] }, { id: 2, reservations: [card(5, 15), card(3, 19), card(4, 20.5)] }] as never

  // Falla si los globitos cuentan mal las reservas fuera de la vista, cuentan dos veces una de grupo o no señalan la más cercana.
  it('counts what is hidden on each side and points at the nearest one', () => {
    // Se ven de las 14:00 a las 18:00 (franjas de 100 px): 10:00 y 12:00 quedan antes; 19:00 y 20:30, después.
    const { left, right } = offscreenReservations(tables, slots, { start: 800, end: 1600 }, 100)
    expect([left?.count, left?.nearest.id, left?.x]).toEqual([2, 2, 400])
    expect([right?.count, right?.nearest.id, right?.x]).toEqual([2, 3, 1800])
  })
  // Falla si aparece un aviso de reservas fuera de la vista cuando todas caben en ella.
  it('says nothing when every reservation fits in view', () => {
    expect(offscreenReservations(tables, slots, { start: 0, end: 2400 }, 100)).toEqual({ left: null, right: null })
  })
})
