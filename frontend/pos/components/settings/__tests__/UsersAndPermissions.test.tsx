import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { UsersForm } from '../KitSettingsForms'
import { RolePermissionsForm } from '../RolePermissionsForm'
import { ROLE_ACTIONS, ROLE_VIEWS, type RolePolicy } from '@/lib/domain/permissions'
import { messages } from '@/lib/i18n/messages'
import { coreFetch } from '@/lib/services/core/http'
import type { PosEmployee } from '@/lib/services/employees'

// Frontera HTTP: la política se lee de `settings?restaurant_id=` y se guarda completa en `settings/roles`.
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const m = jest.mocked(coreFetch)
// Lo que el dueño ya había guardado: además de lo de siempre, el mesero cobra.
const SAVED: RolePolicy = {
  waiter: { views: ['tables'], actions: ['create_orders', 'serve_orders', 'charge_orders'] },
  cashier: { views: ['orders'], actions: ['create_orders', 'charge_orders'] },
  admin: { views: [...ROLE_VIEWS], actions: [...ROLE_ACTIONS] },
}
beforeEach(() => { m.mockReset(); m.mockResolvedValue({ role_policy: SAVED }) })

// jsdom no trae structuredClone (el navegador sí); basta una copia JSON para la política de permisos.
globalThis.structuredClone ??= ((value: unknown) => JSON.parse(JSON.stringify(value))) as typeof structuredClone
const intl = (ui: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const employees: PosEmployee[] = [
  { id: 1, name: 'Sofía Mesera', code: null, role: 'waiter', shift: { from: 8, to: 16 } },
  { id: 2, name: 'Carlos Cajero', code: null, role: 'cashier', shift: null },
  { id: 3, name: 'Administrator', code: null, role: null, shift: null },
]

// Falla si «Tu equipo» deja fuera a las personas del restaurante o les inventa un rol.
it('muestra en el equipo a las personas y su horario', () => {
  intl(<UsersForm employees={employees} />)
  const team = screen.getByRole('region', { name: 'Tu equipo' })
  expect(within(team).getByText('Sofía Mesera').closest('div.flex')).toHaveTextContent('Mesero')
  expect(within(team).getByText('Carlos Cajero').closest('div.flex')).toHaveTextContent('Sin horario')
  expect(within(team).getByText('Administrator').closest('div.flex')).toHaveTextContent('Rol de su cuenta')
})

// Falla si la tabla de permisos deja de decir cuántas personas tiene cada rol (lo que la liga con la lista del equipo).
it('la tabla de permisos dice cuántas personas tiene cada rol', () => {
  render(<RolePermissionsForm configId={1} counts={{ waiter: 1, cashier: 2 }} />)
  expect(screen.getByText('1 persona')).toBeInTheDocument()
  expect(screen.getByText('2 personas')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Qué puede hacer cada rol' })).toBeInTheDocument()
})

// Falla si la tabla de permisos ofrece dar a un rol una vista o acción de un módulo apagado en ese local.
it('no ofrece permisos de módulos apagados en el local', () => {
  const { useAuthStore } = jest.requireActual('@/lib/stores/authStore') as typeof import('@/lib/stores/authStore')
  useAuthStore.setState({ modules: ['nucleo', 'salon', 'inventario'], restaurantModules: { 1: ['nucleo', 'salon'] } })
  render(<RolePermissionsForm configId={1} />)
  expect(screen.queryByText('Inventario')).toBeNull()
  expect(screen.queryByText('Modificar inventario')).toBeNull()
  expect(screen.queryByText('Cocina')).toBeNull()
  expect(screen.getAllByText(/Salón|Mesas/).length).toBeGreaterThan(0)
  useAuthStore.setState({ modules: null, restaurantModules: null })
})

// Falla si la consola muestra la política por omisión en vez de la guardada: el dueño veía sin «Cobrar pedidos» a un
// mesero al que ya le había dado ese permiso.
it('muestra la política guardada de cada rol', async () => {
  render(<RolePermissionsForm configId={1} />)
  await waitFor(() => expect(screen.getByLabelText('Mesero: Cobrar pedidos')).toBeChecked())
  expect(m).toHaveBeenCalledWith('settings?restaurant_id=1')
})

// Falla si guardar desde la consola vuelve a pisar con la política por omisión los permisos que el dueño ya había
// concedido (el PUT reemplaza la política completa de la organización).
it('guarda el cambio sin perder los permisos ya concedidos', async () => {
  m.mockImplementation(async (path: string, options?: { body?: unknown }) => (path === 'settings/roles' ? { role_policy: options?.body } : { role_policy: SAVED }))
  render(<RolePermissionsForm configId={1} />)
  await waitFor(() => expect(screen.getByLabelText('Mesero: Cobrar pedidos')).toBeChecked())
  fireEvent.click(screen.getByLabelText('Mesero: Inventario'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }))
  await waitFor(() => expect(m).toHaveBeenCalledWith('settings/roles', expect.objectContaining({ method: 'PUT' })))
  const put = m.mock.calls.find(([path]) => path === 'settings/roles')![1] as { body: RolePolicy }
  expect(put.body.waiter).toEqual({ views: ['tables', 'inventory'], actions: ['create_orders', 'serve_orders', 'charge_orders'] })
})

// Falla si con la lectura de la política fallida se puede guardar: el PUT reemplazaría la política guardada por la de
// por omisión sin que el dueño lo sepa.
it('sin la política guardada no deja guardar', async () => {
  m.mockRejectedValue(new Error('Sin conexión'))
  render(<RolePermissionsForm configId={1} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron leer los permisos guardados')
  expect(screen.getByRole('button', { name: 'Guardar permisos' })).toBeDisabled()
})
