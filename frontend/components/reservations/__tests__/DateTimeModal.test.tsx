import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { DateTimeModal } from '@/components/reservations/DateTimeModal'
import type { Schedule } from '@/lib/domain/reservationHours'
import type { Slot } from '@/lib/domain/reservations'
import { messages } from '@/lib/i18n/messages'

const slot = (time: number, past = false): Slot => ({ time, label: `${String(Math.floor(time)).padStart(2, '0')}:${time % 1 ? '30' : '00'}`, past })
const open: Schedule = { weekly: { 0: [[12, 15]], 1: [[12, 15]], 2: [[12, 15]], 3: [[12, 15]], 4: [[12, 15]], 5: [[12, 15]], 6: [] }, overrides: [], rules: { minNotice: 0, maxDays: 0 } }

beforeEach(() => { jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] }); jest.setSystemTime(new Date('2026-09-16T23:30:00')) }) // miércoles, de noche
afterEach(() => jest.useRealTimers())

function mount(loadSlots: jest.Mock, onPick = jest.fn(), schedule: Schedule | null = open) {
  render(<NextIntlClientProvider locale="es" messages={messages}>
    <DateTimeModal open onClose={jest.fn()} date="2026-09-16" time={null} loadSlots={loadSlots} schedule={schedule} onPick={onPick} />
  </NextIntlClientProvider>)
  return onPick
}

// El fallo que reportó el usuario: de noche todas las horas de hoy vienen «pasadas»; al tocar otro día el modal seguía
// pintando esas mismas horas deshabilitadas y no se podía reservar para mañana. Falla si el modal deja de pedir las
// horas del día que se toca.
it('asks for the slots of the day you tap, so a late evening does not block tomorrow', async () => {
  const loadSlots = jest.fn((day: string) => Promise.resolve(day === '2026-09-16' ? [slot(12, true), slot(12.5, true)] : [slot(12), slot(12.5)]))
  const onPick = mount(loadSlots)
  expect(await screen.findByText(/Ya no quedan horas para reservar ese día/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '12:00' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: '17' }))
  await waitFor(() => expect(loadSlots).toHaveBeenLastCalledWith('2026-09-17'))
  await waitFor(() => expect(screen.getByRole('button', { name: '12:30' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '12:30' }))
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
  expect(onPick).toHaveBeenCalledWith('2026-09-17', 12.5)
})

// Falla si se puede elegir un día que ya pasó o uno que el horario cierra (domingo), o si una hora elegida en un día
// sobrevive al cambiar a otro día que no la ofrece.
it('blocks past and closed days and forgets a time the new day does not offer', async () => {
  const loadSlots = jest.fn((day: string) => Promise.resolve(day === '2026-09-17' ? [slot(12), slot(14)] : [slot(12)]))
  mount(loadSlots)
  expect(screen.getByRole('button', { name: '15' })).toBeDisabled()
  expect(screen.getByRole('button', { name: /^20, cerrado/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: '16' })).toHaveAttribute('aria-current', 'date')

  fireEvent.click(screen.getByRole('button', { name: '17' }))
  fireEvent.click(await screen.findByRole('button', { name: '14:00' }))
  expect(screen.getByRole('button', { name: 'Aplicar' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: '18' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '14:00' })).not.toBeInTheDocument())
  expect(screen.getByRole('button', { name: 'Aplicar' })).toBeDisabled()
})

// Falla si un día sin franjas (p. ej. una fecha especial cerrada que el calendario aún no conoce) se queda en blanco
// sin explicar nada.
it('says so when the day takes no reservations', async () => {
  mount(jest.fn(() => Promise.resolve([])), jest.fn(), null)
  const dialog = screen.getByRole('dialog')
  expect(await within(dialog).findByText('Ese día no se reciben reservas.')).toBeInTheDocument()
})

// Falla si una hora que no cumple la antelación mínima (`soon`) se puede elegir, o si el calendario deja tocar días
// más allá de la ventana de reservas.
it('blocks hours inside the minimum notice and days beyond the booking window', async () => {
  const loadSlots = jest.fn(() => Promise.resolve([{ ...slot(12), soon: true }, slot(12.5)]))
  mount(loadSlots, jest.fn(), { ...open, rules: { minNotice: 120, maxDays: 7 } })
  fireEvent.click(screen.getByRole('button', { name: '17' }))
  expect(await screen.findByRole('button', { name: '12:00' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '12:30' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '23' })).toBeEnabled()   // hoy 16 + 7 días
  expect(screen.getByRole('button', { name: '24' })).toBeDisabled()
  expect(screen.getByText(/Se reserva hasta 7 días hacia adelante/)).toBeInTheDocument()
})
