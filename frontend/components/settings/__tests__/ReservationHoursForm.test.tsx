import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ReservationHoursForm } from '@/components/settings/ReservationHoursForm'
import type { Schedule } from '@/lib/domain/reservationHours'
import { messages } from '@/lib/i18n/messages'
import { getSchedule, saveSchedule } from '@/lib/services/reservationHours'

jest.mock('@/lib/services/reservationHours', () => ({ getSchedule: jest.fn(), saveSchedule: jest.fn() }))

// El formulario pinta 14 selectores de 48 horas; las consultas por rol de Testing Library recorren esas ~700 opciones
// y, con toda la suite en paralelo, la primera prueba pasa de los 5 s por defecto sin que nada esté colgado.
jest.setTimeout(30000)

const legacy = (): Schedule => ({ weekly: { 0: [[10, 22]], 1: [[10, 22]], 2: [[10, 22]], 3: [[10, 22]], 4: [[10, 22]], 5: [[10, 22]], 6: [[10, 22]] }, overrides: [], rules: { minNotice: 0, maxDays: 0 } })
const mount = () => render(<NextIntlClientProvider locale="es" messages={messages}><ReservationHoursForm configId={1} /></NextIntlClientProvider>)
const day = async (name: string) => within(await screen.findByRole('group', { name }))

beforeEach(() => {
  jest.clearAllMocks()
  ;(getSchedule as jest.Mock).mockResolvedValue(legacy())
  ;(saveSchedule as jest.Mock).mockImplementation((_id: number, s: Schedule) => Promise.resolve(s))
})

// Falla si no se puede partir un día en almuerzo y cena, copiarlo a otros días, cerrar un día, o si lo guardado no es
// exactamente lo que se ve.
it('splits a day in two ranges, copies it to other days, closes a day and saves exactly that', async () => {
  mount()
  const monday = await day('Lunes')
  expect(screen.getByRole('button', { name: 'Guardar horario' })).toBeDisabled()
  fireEvent.change(monday.getByLabelText('Desde, franja 1 del Lunes'), { target: { value: '12' } })
  fireEvent.change(monday.getByLabelText('Hasta, franja 1 del Lunes'), { target: { value: '15' } })
  fireEvent.click(monday.getByRole('button', { name: 'Agregar franja al Lunes' }))
  fireEvent.change(monday.getByLabelText('Hasta, franja 2 del Lunes'), { target: { value: '22.5' } })
  fireEvent.change(monday.getByLabelText('Desde, franja 2 del Lunes'), { target: { value: '18' } })

  fireEvent.click(monday.getByRole('button', { name: 'Copiar el horario del Lunes a otros días' }))
  const copy = within(screen.getByRole('group', { name: 'Copiar el horario del Lunes a:' }))
  fireEvent.click(copy.getByRole('button', { name: 'Martes' }))
  fireEvent.click(copy.getByRole('button', { name: 'Copiar' }))
  fireEvent.click((await day('Domingo')).getByRole('switch', { name: 'Recibir reservas el Domingo' }))
  expect((await day('Domingo')).getByText('Cerrado')).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Guardar horario' }))
  await waitFor(() => expect(saveSchedule).toHaveBeenCalledTimes(1))
  const sent: Schedule = (saveSchedule as jest.Mock).mock.calls[0][1]
  expect(sent.weekly['0']).toEqual([[12, 15], [18, 22.5]])
  expect(sent.weekly['1']).toEqual([[12, 15], [18, 22.5]])
  expect(sent.weekly['2']).toEqual([[10, 22]])
  expect(sent.weekly['6']).toEqual([])
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar horario' })).toBeDisabled())
})

// Falla si se puede guardar un día con franjas pisadas: el servidor lo rechazaría con un error menos claro.
it('names overlapping ranges on the day and refuses to save them', async () => {
  mount()
  const monday = await day('Lunes')
  fireEvent.click(monday.getByRole('button', { name: 'Agregar franja al Lunes' }))
  fireEvent.change(monday.getByLabelText('Desde, franja 2 del Lunes'), { target: { value: '20' } })
  expect(monday.getByRole('alert')).toHaveTextContent('Las franjas se pisan')
  expect(screen.getByRole('button', { name: 'Guardar horario' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('Corrige las franjas marcadas')
  fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios' }))
  expect((await day('Lunes')).queryByRole('alert')).not.toBeInTheDocument()
})

// Falla si una fecha especial no llega al guardado, si por defecto no cierra el día (lo habitual en un festivo) o si no
// se puede quitar.
it('adds a closed special date, then one with its own hours, and removes one', async () => {
  mount()
  const special = within(await screen.findByRole('region', { name: 'Fechas especiales' }))
  expect(special.getByText('No hay fechas especiales.')).toBeInTheDocument()
  fireEvent.click(special.getByRole('button', { name: 'Agregar fecha especial' }))
  fireEvent.change(special.getByLabelText('Fecha'), { target: { value: '2030-12-25' } })
  fireEvent.change(special.getByLabelText('Motivo (opcional)'), { target: { value: ' Navidad ' } })
  fireEvent.click(special.getByRole('button', { name: 'Agregar fecha' }))

  fireEvent.click(special.getByRole('button', { name: 'Agregar fecha especial' }))
  fireEvent.change(special.getByLabelText('Fecha'), { target: { value: '2030-12-24' } })
  fireEvent.click(special.getByRole('switch', { name: 'Ese día sí se reciben reservas' }))
  fireEvent.change(special.getByLabelText('Hasta, franja 1 del ese día'), { target: { value: '16' } })
  fireEvent.click(special.getByRole('button', { name: 'Agregar fecha' }))

  fireEvent.click(screen.getByRole('button', { name: 'Guardar horario' }))
  await waitFor(() => expect(saveSchedule).toHaveBeenCalled())
  expect((saveSchedule as jest.Mock).mock.calls[0][1].overrides).toEqual([
    { date: '2030-12-24', ranges: [[12, 16]], note: '' }, { date: '2030-12-25', ranges: [], note: 'Navidad' }])

  fireEvent.click(special.getByRole('button', { name: /Quitar la fecha .*25 de diciembre/ }))
  expect(special.queryByText(/25 de diciembre/)).not.toBeInTheDocument()
})

// Falla si las reglas de antelación no se pueden editar o no viajan con el horario al guardar.
it('saves the minimum notice and the booking window with the schedule', async () => {
  mount()
  const rules = within(await screen.findByRole('region', { name: 'Antelación' }))
  fireEvent.change(rules.getByLabelText(/^Antelación mínima/), { target: { value: '120' } })
  fireEvent.change(rules.getByLabelText(/^Hasta cuándo se reserva/), { target: { value: '60' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar horario' }))
  await waitFor(() => expect(saveSchedule).toHaveBeenCalled())
  expect((saveSchedule as jest.Mock).mock.calls[0][1].rules).toEqual({ minNotice: 120, maxDays: 60 })
})
