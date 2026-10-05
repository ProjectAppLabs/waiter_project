import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import PedidosPage from '@/app/(pos)/pedidos/page'
import type { OrderLocation } from '@/lib/domain/orderLocation'
import type { KitOrder, KitStatus } from '@/lib/domain/orderState'
import { messages } from '@/lib/i18n/messages'
import { useNetworkStore } from '@/lib/offline/network'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'

// Los hooks de pedidos y ubicaciones tienen sus propias pruebas: aquí se les da lo que leerían del servidor.
let orders: KitOrder[] = []
let loaded = true
const statuses: Record<number, KitStatus> = { 1: 'pending_send', 2: 'ready', 3: 'waiting_payment', 4: 'in_progress' }
const locations = new Map<number, OrderLocation>([
  [1, { floorId: 10, zoneId: 'z1', floor: 'Piso 1', zone: 'Terraza', zoneStatus: 'ready' }],
  [2, { floorId: 10, zoneId: null, floor: 'Piso 1', zone: null, zoneStatus: 'unassigned' }],
  [3, { floorId: 20, zoneId: 'z9', floor: 'Piso 2', zone: 'Salón', zoneStatus: 'ready' }],
])
jest.mock('@/lib/hooks/useKitOrders', () => ({ useKitOrders: () => ({ orders, loaded, statusOf: (o: KitOrder) => statuses[o.id] }) }))
jest.mock('@/lib/hooks/useOrderLocations', () => ({ useOrderLocations: () => locations }))

const line = { id: 1, uuid: 'l', productId: 1, name: 'Hamburguesa', qty: 2, unitPrice: 10000, subtotal: 20000, total: 20000, note: '', courseId: null, readyAt: null, servedAt: null, options: [] }
const order = (id: number, number: string, tableId: number | null, customer: string, startedAt: string, lines = [line]) =>
  ({ id, number, type: tableId === null ? 'takeout' : 'dine_in', state: 'draft', tableId, tableNumber: tableId, customer, startedAt, total: 20000, tax: 0, lines, courses: [] }) as unknown as KitOrder
const shown = () => screen.queryAllByRole('article').map((a) => a.getAttribute('aria-label'))

function as(role: 'waiter' | 'cashier' | 'admin', settings: Record<string, unknown> = {}) {
  useAuthStore.setState({ user: { uid: 1, name: 'Persona', companyId: 1, role } as never, employee: null })
  useCatalogStore.setState({ catalog: { settings: { waiterCanCharge: false, ...settings }, floors: [{ id: 10, name: 'Piso 1' }, { id: 20, name: 'Piso 2' }] } as never })
}
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><PedidosPage /></NextIntlClientProvider>)

beforeEach(() => {
  loaded = true
  useNetworkStore.setState({ online: true, since: null })
  orders = [
    order(1, 'DI-01', 1, 'Ana', '2026-10-04 10:00:00'),
    order(2, 'DI-02', 2, 'Beto', '2026-10-04 11:00:00'),
    order(3, 'DI-03', 3, 'Dora', '2026-10-04 10:30:00'),
    order(4, 'LL-04', null, 'Carla', '2026-10-04 09:00:00', []),
  ]
})

// Falla si los chips no cuentan los pedidos de cada estado, si filtrar por «Listos para servir» deja ver otros, o si
// «Limpiar filtros» no devuelve la lista completa.
it('filtra por estado con sus conteos y limpia los filtros', () => {
  as('admin')
  wrap()
  expect(shown()).toEqual(['Cuenta DI-02', 'Cuenta DI-03', 'Cuenta DI-01', 'Cuenta LL-04'])
  expect(screen.getByRole('button', { name: 'Todos 4' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Sin enviar 1' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Servidos 0' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Listos para servir 1' }))
  expect(shown()).toEqual(['Cuenta DI-02'])
  expect(screen.getByText('1 de 4 pedidos')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  expect(shown()).toHaveLength(4)
  expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull()
})

// Falla si la búsqueda no encuentra por cliente o por número con «#», si los conteos no siguen a la búsqueda, o si una
// búsqueda sin resultados dice «Sin pedidos» como si no hubiera ninguno.
it('busca por cliente o número y distingue «sin resultados» de «sin pedidos»', () => {
  as('admin')
  const first = wrap()
  const search = screen.getByRole('textbox', { name: 'Buscar por número o cliente' })
  fireEvent.change(search, { target: { value: 'carla' } })
  expect(shown()).toEqual(['Cuenta LL-04'])
  expect(screen.getByRole('button', { name: 'Todos 1' })).toBeInTheDocument()
  fireEvent.change(search, { target: { value: '#DI-02' } })
  expect(shown()).toEqual(['Cuenta DI-02'])
  fireEvent.change(search, { target: { value: 'nadie' } })
  expect(screen.getByText('No hay pedidos con estos filtros')).toBeInTheDocument()
  first.unmount()
  orders = []
  wrap()
  expect(screen.getByText('Sin pedidos')).toBeInTheDocument()
  expect(screen.getByText('0 de 0 pedidos')).toBeInTheDocument()
})

// Falla si filtrar por piso deja pasar pedidos de otro piso, si las zonas no son las de ese piso (incluida «Sin zona
// asignada»), o si «Sin mesa» no muestra solo los pedidos para llevar y no bloquea la zona.
it('filtra por piso, zona y sin mesa', () => {
  as('admin')
  wrap()
  const [floor, zone] = screen.getAllByRole('combobox')
  fireEvent.change(floor, { target: { value: '10' } })
  expect(shown()).toEqual(['Cuenta DI-02', 'Cuenta DI-01'])
  expect(within(zone).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas las zonas', 'Terraza', 'Sin zona asignada'])
  fireEvent.change(zone, { target: { value: 'unassigned' } })
  expect(shown()).toEqual(['Cuenta DI-02'])
  fireEvent.change(zone, { target: { value: JSON.stringify([10, 'z1']) } })
  expect(shown()).toEqual(['Cuenta DI-01'])
  // Cambiar de piso vuelve la zona a «todas»: una zona del piso anterior no puede dejar la lista vacía.
  fireEvent.change(floor, { target: { value: 'all' } })
  expect(zone).toHaveValue('all')
  expect(within(zone).getByRole('option', { name: 'Piso 2 · Salón' })).toBeInTheDocument()
  fireEvent.change(floor, { target: { value: 'no_table' } })
  expect(shown()).toEqual(['Cuenta LL-04'])
  expect(zone).toBeDisabled()
})

// Falla si ordenar por «Más antiguo» no invierte el orden por hora de inicio.
it('ordena del más reciente al más antiguo', () => {
  as('admin')
  wrap()
  fireEvent.click(screen.getByRole('button', { name: /Ordenar|Más reciente/ }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Más antiguo' }))
  expect(shown()).toEqual(['Cuenta LL-04', 'Cuenta DI-01', 'Cuenta DI-03', 'Cuenta DI-02'])
})

// Falla si un mesero puede cobrar sin que el restaurante lo permita, si lo pierde cuando sí está permitido, si el cobro
// no lleva al pago de ese pedido, o si se ofrece cobrar una cuenta sin platos.
it('cobrar respeta el permiso del mesero y la cuenta vacía', () => {
  as('waiter')
  const first = wrap()
  expect(screen.queryByRole('link', { name: 'Cobrar' })).toBeNull()
  expect(within(screen.getByRole('article', { name: 'Cuenta DI-01' })).getByRole('button', { name: 'Sin permiso de cobro' })).toBeDisabled()
  first.unmount()
  as('waiter', { waiterCanCharge: true })
  wrap()
  expect(within(screen.getByRole('article', { name: 'Cuenta DI-01' })).getByRole('link', { name: 'Cobrar' })).toHaveAttribute('href', '/pago/1')
  expect(within(screen.getByRole('article', { name: 'Cuenta LL-04' })).queryByRole('link', { name: 'Cobrar' })).toBeNull()
})

// Falla si en emergencia (plan V) un mesero sigue pudiendo crear pedidos, o si la caja pierde el botón; también si fuera
// de emergencia el mesero no puede crear.
it('en emergencia solo la caja crea pedidos', () => {
  as('waiter')
  const first = wrap()
  expect(screen.getByRole('link', { name: 'Crear pedido' })).toHaveAttribute('href', '/pedidos/nuevo')
  first.unmount()
  useNetworkStore.setState({ online: false, since: Date.now() - 4 * 60_000 })
  const second = wrap()
  expect(screen.queryByRole('link', { name: 'Crear pedido' })).toBeNull()
  second.unmount()
  as('cashier')
  wrap()
  expect(screen.getByRole('link', { name: 'Crear pedido' })).toBeInTheDocument()
})

// Falla si mientras llegan los pedidos se anuncia «Sin pedidos» o un conteo en cero que no es cierto.
it('mientras carga no dice que no hay pedidos', () => {
  loaded = false
  as('admin')
  wrap()
  expect(screen.queryByText('Sin pedidos')).toBeNull()
  expect(screen.queryByText(/de 4 pedidos/)).toBeNull()
  expect(shown()).toEqual([])
})
