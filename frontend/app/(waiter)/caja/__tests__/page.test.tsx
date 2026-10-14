import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import CajaPage from '@/app/caja/page'
import { messages } from '@/lib/i18n/messages'
import { listConfigs } from '@/lib/services/cashRegister'
import { useAuthStore } from '@/lib/stores/authStore'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))
jest.mock('@/lib/services/cashRegister', () => ({ listConfigs: jest.fn(async () => [{ id: 4, name: 'Caja Centro' }, { id: 5, name: 'Caja Norte' }]) }))

const openRegister = jest.fn(async () => undefined)
function as(role: 'admin' | 'cashier', over: Record<string, unknown> = {}) {
  useAuthStore.setState({ user: { uid: 1, name: 'Carlos', companyId: 1, role } as never, employee: { role, name: 'Carlos' } as never, session: null, restaurant: null, restaurants: null,
    hydrated: true, hydrate: jest.fn(async () => undefined), openRegister, chooseRestaurant: jest.fn(async () => undefined), ...over })
}
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><CajaPage /></NextIntlClientProvider>)
beforeEach(() => jest.clearAllMocks())

// Falla si el efectivo marcado con el teclado (incluido borrar) no es el que abre la caja, o si la caja se abre en otro
// local distinto al elegido; también si después no lleva al salón.
it('abre la caja con el efectivo del teclado en la caja elegida', async () => {
  as('cashier')
  wrap()
  await waitFor(() => expect(screen.getByLabelText('Caja')).toHaveValue('4'))
  fireEvent.change(screen.getByLabelText('Caja'), { target: { value: '5' } })
  for (const d of ['1', '5', '0', '0', '0', '0', '9']) fireEvent.click(screen.getByRole('button', { name: d }))
  fireEvent.click(screen.getByRole('button', { name: 'Borrar' }))
  expect(screen.getByLabelText('Efectivo inicial (COP)')).toHaveValue('150.000')
  fireEvent.change(screen.getByLabelText('Notas'), { target: { value: 'Base del lunes' } })
  fireEvent.click(screen.getByRole('button', { name: /Abrir caja/ }))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/salon'))
  expect(openRegister).toHaveBeenCalledWith(5, 150000, 'Base del lunes')
  expect(screen.queryByRole('link', { name: /sin abrir caja/ })).toBeNull()
})

// Falla si con el restaurante del dispositivo ya elegido la caja se abre en otro, o si el encargado pierde la entrada a
// administración sin abrir caja.
it('con el restaurante del dispositivo abre ahí y el encargado puede entrar sin caja', async () => {
  as('admin', { restaurant: { id: 9, name: 'Poblado' }, restaurants: [{ id: 9, name: 'Poblado' }] })
  wrap()
  expect(screen.getByText('Poblado')).toBeInTheDocument()
  expect(listConfigs).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: /sin abrir caja/ })).toHaveAttribute('href', '/dashboard')
  fireEvent.click(screen.getByRole('button', { name: /Abrir caja/ }))
  await waitFor(() => expect(openRegister).toHaveBeenCalledWith(9, 0, ''))
})

// Falla si alguien con la caja ya abierta, o sin sesión, se queda en esta pantalla en vez de ir al salón o al inicio.
it('con caja abierta va al salón y sin sesión al inicio', async () => {
  as('cashier', { session: { id: 3, configId: 4, state: 'opened' } })
  const first = wrap()
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/salon'))
  first.unmount()
  useAuthStore.setState({ user: null, session: null })
  wrap()
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
})

// Falla si, cuando el servidor rechaza abrir la caja, la pantalla se queda muda (sin mensaje) o navega igual al salón.
it('muestra el mensaje del servidor cuando no se puede abrir la caja', async () => {
  as('cashier', { openRegister: jest.fn(async () => { throw new Error('No tienes permiso para esta acción.') }) })
  wrap()
  await waitFor(() => expect(screen.getByLabelText('Caja')).toHaveValue('4'))
  fireEvent.click(screen.getByRole('button', { name: /Abrir caja/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para esta acción.')
  expect(replace).not.toHaveBeenCalledWith('/salon')
})
