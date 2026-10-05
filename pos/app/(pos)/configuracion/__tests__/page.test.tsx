import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import ConfiguracionPage from '@/app/(pos)/configuracion/page'
import { messages } from '@/lib/i18n/messages'
import { listPosEmployees, type PosEmployee } from '@/lib/services/employees'
import { getRestaurantInfo, type RestaurantInfo } from '@/lib/services/restaurantInfo'
import { listPaymentMethods } from '@/lib/services/settings'
import { useCatalogStore } from '@/lib/stores/catalogStore'

jest.mock('@/lib/services/restaurantInfo', () => ({ getRestaurantInfo: jest.fn() }))
jest.mock('@/lib/services/settings', () => ({ listPaymentMethods: jest.fn() }))
jest.mock('@/lib/services/employees', () => ({ listPosEmployees: jest.fn() }))
// Los formularios tienen sus propias pruebas; aquí basta ver qué datos reciben y en qué pestaña aparecen.
jest.mock('@/components/settings/RestaurantInfoForm', () => ({ RestaurantInfoForm: ({ initial }: { initial: RestaurantInfo }) => <p>{`Local ${initial.name}`}</p> }))
jest.mock('@/components/settings/KitSettingsForms', () => ({
  PaymentMethodsList: ({ methods }: { methods: { name: string }[] }) => <ul aria-label="Medios">{methods.map((m) => <li key={m.name}>{m.name}</li>)}</ul>,
  UsersForm: ({ employees }: { employees: PosEmployee[] }) => <ul aria-label="Equipo">{employees.map((e) => <li key={e.id}>{e.name}</li>)}</ul>,
  DisplayForm: () => <p>Densidad y estación</p>,
}))
jest.mock('@/components/settings/KitchenPaymentPolicyForm', () => ({ KitchenPaymentPolicyForm: ({ configId, readOnly }: { configId: number; readOnly?: boolean }) => <p>{`Política ${configId}${readOnly ? ' solo lectura' : ''}`}</p> }))

const info = (id: number, name: string) => ({ id, name, phone: '', street: '', city: '', latitude: '', longitude: '', accessMargin: 15 }) as RestaurantInfo
const employee = (id: number, name: string): PosEmployee => ({ id, name, code: null, role: 'waiter', shift: null })
const setConfig = (configId: number) => useCatalogStore.setState({ catalog: { settings: { configId } } as never })
const page = <NextIntlClientProvider locale="es" messages={messages}><ConfiguracionPage /></NextIntlClientProvider>
const tab = (name: string) => within(screen.getByRole('navigation', { name: 'Configuración' })).getByRole('button', { name })

beforeEach(() => {
  jest.clearAllMocks()
  setConfig(4)
  jest.mocked(getRestaurantInfo).mockImplementation(async (id: number) => info(id, id === 4 ? 'Centro' : 'Norte'))
  jest.mocked(listPaymentMethods).mockResolvedValue([{ id: 1, name: 'Efectivo', type: 'cash' }, { id: 2, name: 'Datáfono', type: 'bank' }])
  jest.mocked(listPosEmployees).mockImplementation(async (id?: number | null) => id === 4 ? [employee(1, 'Ana'), employee(2, 'Luis')] : [employee(3, 'Marta')])
})

// Falla si sin carta (sin restaurante) la pantalla consulta datos o pinta algo.
it('sin restaurante no pinta ni consulta nada', () => {
  useCatalogStore.setState({ catalog: null })
  const { container } = render(page)
  expect(container).toBeEmptyDOMElement()
  expect(getRestaurantInfo).not.toHaveBeenCalled()
  expect(listPosEmployees).not.toHaveBeenCalled()
})

// Falla si la pestaña inicial no es la del restaurante con los datos de este local, o si las pestañas no muestran su
// contenido: medios de pago, el equipo de este restaurante con la política de cobro en solo lectura (la decide el
// dueño en su consola) y la pantalla.
it('muestra cada sección del restaurante en su pestaña', async () => {
  render(page)
  expect(tab('Restaurante')).toHaveAttribute('aria-current', 'page')
  expect(await screen.findByText('Local Centro')).toBeInTheDocument()
  expect(getRestaurantInfo).toHaveBeenCalledWith(4)
  expect(listPosEmployees).toHaveBeenCalledWith(4)

  fireEvent.click(tab('Métodos de pago'))
  expect(tab('Métodos de pago')).toHaveAttribute('aria-current', 'page')
  expect(tab('Restaurante')).not.toHaveAttribute('aria-current')
  const payments = screen.getByRole('region', { name: 'Métodos de pago' })
  expect(within(payments).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Efectivo', 'Datáfono'])
  expect(within(payments).getByText(/las configura el dueño en su consola/)).toBeInTheDocument()
  expect(screen.queryByText('Local Centro')).toBeNull()

  fireEvent.click(tab('Usuarios y permisos'))
  const users = screen.getByRole('region', { name: 'Usuarios y permisos' })
  expect(within(users).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Ana', 'Luis'])
  expect(within(users).getByText('Política 4 solo lectura')).toBeInTheDocument()

  fireEvent.click(tab('Pantalla y sonido'))
  expect(screen.getByText('Densidad y estación')).toBeInTheDocument()
})

// Falla si un error al leer el equipo o los datos del local rompe la pantalla en vez de dejar la sección vacía.
it('si los servicios fallan, la pantalla sigue en pie', async () => {
  jest.mocked(getRestaurantInfo).mockRejectedValue(new Error('sin red'))
  jest.mocked(listPaymentMethods).mockRejectedValue(new Error('sin red'))
  jest.mocked(listPosEmployees).mockRejectedValue(new Error('sin red'))
  render(page)
  await waitFor(() => expect(listPosEmployees).toHaveBeenCalled())
  expect(screen.queryByText(/^Local /)).toBeNull()
  fireEvent.click(tab('Usuarios y permisos'))
  expect(within(screen.getByRole('region', { name: 'Usuarios y permisos' })).queryAllByRole('listitem')).toHaveLength(0)
  fireEvent.click(tab('Métodos de pago'))
  expect(within(screen.getByRole('region', { name: 'Métodos de pago' })).queryAllByRole('listitem')).toHaveLength(0)
})

// Falla si al cambiar de restaurante la respuesta tardía del anterior pisa los datos del nuevo: el encargado vería y
// editaría el local o el equipo de otro restaurante.
it('al cambiar de restaurante descarta las respuestas del anterior', async () => {
  let lateInfo: (r: RestaurantInfo) => void = () => undefined
  let lateTeam: (e: PosEmployee[]) => void = () => undefined
  jest.mocked(getRestaurantInfo).mockImplementationOnce(() => new Promise((r) => { lateInfo = r }))
  jest.mocked(listPosEmployees).mockImplementationOnce(() => new Promise((r) => { lateTeam = r }))
  const { rerender } = render(page)
  act(() => setConfig(5))
  rerender(page)
  expect(await screen.findByText('Local Norte')).toBeInTheDocument()
  expect(listPosEmployees).toHaveBeenLastCalledWith(5)
  await act(async () => { lateInfo(info(4, 'Centro')); lateTeam([employee(1, 'Ana')]) })
  expect(screen.getByText('Local Norte')).toBeInTheDocument()
  expect(screen.queryByText('Local Centro')).toBeNull()
  fireEvent.click(tab('Usuarios y permisos'))
  expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Marta'])
  expect(screen.getByText('Política 5 solo lectura')).toBeInTheDocument()
})
