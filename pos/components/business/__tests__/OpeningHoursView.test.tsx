import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { OpeningHoursView } from '@/components/business/OpeningHoursView'
import { OrgContext } from '@/components/organization/OrgContext'
import { messages } from '@/lib/i18n/messages'
import { openingHours, removeOpeningHours, saveOpeningHours } from '@/lib/services/core/business'
import type { Restaurant } from '@/lib/services/restaurants'

jest.mock('@/lib/services/core/business', () => ({ openingHours: jest.fn(), saveOpeningHours: jest.fn(), removeOpeningHours: jest.fn() }))
jest.setTimeout(30000)

const venues = [{ id: 1, name: 'Poblado' }, { id: 2, name: 'Duitama' }] as Restaurant[]
const weekly = Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [[12, 22]]]))
const configured = { hours: { weekly, overrides: [] }, status: { configurado: true, abierto: false, abre: { cuando: 'mañana', hora: '12 m.', fecha: '2026-10-11' } } }
const always = { hours: null, status: { configurado: false, abierto: true } }
const mount = () => render(<NextIntlClientProvider locale="es" messages={messages}>
  <OrgContext.Provider value={{ restaurants: venues, reload: async () => undefined, companyName: '' }}><OpeningHoursView /></OrgContext.Provider></NextIntlClientProvider>)

beforeEach(() => {
  jest.clearAllMocks()
  ;(openingHours as jest.Mock).mockImplementation((id: number) => Promise.resolve(id === 1 ? always : configured))
  ;(saveOpeningHours as jest.Mock).mockImplementation((_id: number, body: unknown) => Promise.resolve({ hours: body, status: { configurado: true, abierto: true, cierra: '10 p. m.' } }))
  ;(removeOpeningHours as jest.Mock).mockResolvedValue(always)
})

// Falla si una sede sin horario no explica que atiende siempre, no propone un horario que se pueda guardar tal cual, o
// si lo guardado no es exactamente lo que se ve (sin las reglas de antelación de reservas).
it('propone un horario para la sede sin horario y lo guarda tal cual', async () => {
  mount()
  expect(await screen.findByText(/no tiene horario: el menú la muestra siempre abierta/)).toBeInTheDocument()
  expect(screen.queryByText('Antelación')).not.toBeInTheDocument()
  const lunes = within(await screen.findByRole('group', { name: 'Lunes' }))
  fireEvent.click(lunes.getByLabelText('Abrir el Lunes'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar horario' }))
  await waitFor(() => expect(saveOpeningHours).toHaveBeenCalled())
  const [id, body] = (saveOpeningHours as jest.Mock).mock.calls[0]
  expect(id).toBe(1)
  expect(body).toEqual({ weekly: { ...Object.fromEntries(['0', '1', '2', '3', '4', '5', '6'].map((d) => [d, [[11, 22]]])), 0: [] }, overrides: [] })
  expect(await screen.findByText('Abierta ahora · cierra a las 10 p. m.')).toBeInTheDocument()
})

// Falla si al cambiar de sede no se carga su horario y su estado, o si «Quitar horario» no pide confirmación antes de
// dejar la sede siempre abierta.
it('cambia de sede, muestra si está cerrada y quita el horario con confirmación', async () => {
  mount()
  await screen.findByRole('group', { name: 'Lunes' })
  fireEvent.change(screen.getByLabelText('Sede'), { target: { value: '2' } })
  expect(await screen.findByText('Cerrada ahora · abre mañana a las 12 m.')).toBeInTheDocument()
  expect(openingHours).toHaveBeenLastCalledWith(2)
  fireEvent.click(screen.getByRole('button', { name: 'Quitar horario' }))
  expect(removeOpeningHours).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Quitar horario' }))
  await waitFor(() => expect(removeOpeningHours).toHaveBeenCalledWith(2))
})
