import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import SalonPage from '@/app/(pos)/salon/page'
import { messages } from '@/lib/i18n/messages'
import { useNetworkStore } from '@/lib/offline/network'
import { deleteFloor, readPlan } from '@/lib/services/floorPlan'
import { fireUnsentLines } from '@/lib/services/kitchen'
import { serveLines } from '@/lib/services/ordersKit'
import { getReservationDetail, listAllFloors, moveOrder, reservedAtByTable, setFloorActive } from '@/lib/services/tables'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useFloorStore } from '@/lib/stores/floorStore'
import { useOrderStore } from '@/lib/stores/orderStore'
import { toast } from '@/lib/stores/toastStore'

let mockAsked: string | null = null
const push = jest.fn()
// La dirección cambia al reemplazarla, como en el navegador: así ?elegir=mesa deja de estar.
const replace = jest.fn(() => { mockAsked = null })
const mockRouter = { push, replace }
const mockRefreshOrders = jest.fn(async () => undefined)
jest.mock('next/navigation', () => ({ useRouter: () => mockRouter, useSearchParams: () => ({ get: () => mockAsked }) }))
jest.mock('@/lib/hooks/useKitOrders', () => ({ useKitOrders: () => ({ orders: [], loaded: true, refresh: mockRefreshOrders }) }))
jest.mock('@/lib/hooks/useOrderLocations', () => ({ useOrderLocations: () => ({}) }))
jest.mock('@/lib/services/pantry', () => ({ imageUrl: (id: number) => `/img/${id}` }))
jest.mock('@/lib/services/floorPlan', () => ({ deleteFloor: jest.fn(), floorBackgroundUrl: () => '/fondo.png', readPlan: jest.fn() }))
jest.mock('@/lib/services/kitchen', () => ({ fireUnsentLines: jest.fn(async () => undefined) }))
jest.mock('@/lib/services/ordersKit', () => ({ serveLines: jest.fn(async () => undefined) }))
jest.mock('@/lib/services/tables', () => ({
  listAllFloors: jest.fn(async () => []), moveOrder: jest.fn(async () => undefined), reservedAtByTable: jest.fn(async () => ({})),
  setFloorActive: jest.fn(async () => undefined), getReservationDetail: jest.fn(() => new Promise(() => undefined)),
}))
jest.mock('@/lib/stores/toastStore', () => ({ toast: jest.fn() }))

// Los hijos del plano tienen sus propias pruebas: aquí son botones que exponen lo que la pantalla les pasa.
type View = { table: { id: number; number: number }; state: string; orderId: number | null }
jest.mock('@/components/tables/FloorPane', () => ({
  FloorPane: ({ floor, views, selectedId, onSelect, onOpenTable, header, controls, pickFree, codeFor, onVisibleTables }: { floor: { id: number; name: string }; views: View[]; codeFor: (v: View) => string | null; onVisibleTables: (id: number, ids: number[] | null) => void; selectedId: number | null; onSelect: (id: number) => void; onOpenTable?: (id: number) => void; header: React.ReactNode; controls: React.ReactNode; pickFree: boolean }) => (
    <section aria-label={`Piso ${floor.name}`} data-pick-free={String(pickFree)}>
      {header}{controls}
      {views.map((v) => <button key={v.table.id} type="button" aria-label={`Mesa ${v.table.number}`} data-state={v.state} aria-pressed={selectedId === v.table.id} onClick={() => onSelect(v.table.id)}>{codeFor(v)}</button>)}
      <button type="button" onClick={() => onVisibleTables(floor.id, views.slice(0, 1).map((v) => v.table.id))}>{`Filtrar zona de ${floor.name}`}</button>
      {onOpenTable && <span>Mesas con servicio</span>}
    </section>
  ),
}))
jest.mock('@/components/tables/FloorHeader', () => ({
  TableLegend: () => null,
  FloorSwitcher: ({ floors, onChange }: { floors: { id: number; name: string }[]; onChange: (id: number) => void }) => <>{floors.map((f) => <button key={f.id} type="button" onClick={() => onChange(f.id)}>{`Ir a ${f.name}`}</button>)}</>,
  SelectedTableBar: ({ name, mayCreate, hasReservation, onClear, onDetail, onReservations, onNewOrder }: { name: string; mayCreate: boolean; hasReservation: boolean; onClear: () => void; onDetail: () => void; onReservations: () => void; onNewOrder: () => void }) => (
    <div role="toolbar" aria-label={`Mesa seleccionada ${name}`}>
      {mayCreate && <button type="button" onClick={onNewOrder}>Crear pedido</button>}
      <button type="button" onClick={onDetail}>Detalle de mesa</button>
      <button type="button" onClick={onReservations}>Info de reserva</button>
      <button type="button" onClick={onClear}>Quitar selección</button>
      {hasReservation && <span>Reservada</span>}
    </div>
  ),
}))
jest.mock('@/components/tables/FloorSettingsPopover', () => ({
  FloorSettingsPopover: ({ open, floors, onAdd, onEdit, onToggle, onDelete }: { open: boolean; floors: { id: number; name: string }[]; onAdd: () => void; onEdit: (f: unknown) => void; onToggle: (f: unknown, on: boolean) => void; onDelete: (f: unknown) => void }) => open ? (
    <div role="dialog" aria-label="Pisos">
      <button type="button" onClick={onAdd}>Agregar piso</button>
      {floors.map((f) => <span key={f.id}>
        <button type="button" onClick={() => onEdit(f)}>{`Editar ${f.name}`}</button>
        <button type="button" onClick={() => onToggle(f, false)}>{`Desactivar ${f.name}`}</button>
        <button type="button" onClick={() => onDelete(f)}>{`Eliminar ${f.name}`}</button>
      </span>)}
    </div>
  ) : null,
}))
jest.mock('@/components/tables/FloorEditor', () => ({
  FloorEditor: ({ initial, onCancel, onSaved }: { initial: { name: string }; onCancel: () => void; onSaved: (plan: { id: number }) => Promise<void> }) => (
    <div role="dialog" aria-label={`Editor ${initial.name}`}>
      <button type="button" onClick={() => void onSaved({ id: 2 })}>Guardar plano</button>
      <button type="button" onClick={onCancel}>Salir del editor</button>
    </div>
  ),
}))
jest.mock('@/components/tables/ServiceSidebar', () => ({
  ServiceSidebar: ({ orders, tables, onOpenTable, visibleTableIds }: { orders: unknown[]; visibleTableIds: number[]; tables: { id: number; number: number }[]; onOpenTable: (id: number) => void }) => (
    <aside aria-label="Servicio">
      <span>{`${orders.length} pedidos en servicio`}</span>
      <span>{`Mesas a la vista: ${visibleTableIds.join(',')}`}</span>
      {tables.map((t) => <button key={t.id} type="button" onClick={() => onOpenTable(t.id)}>{`Servicio mesa ${t.number}`}</button>)}
    </aside>
  ),
}))
jest.mock('@/components/tables/ReservationListModal', () => ({
  ReservationListModal: ({ open, onDetail }: { open: boolean; onDetail: (r: { id: number }) => void }) => open ? <div role="dialog" aria-label="Reservas"><button type="button" onClick={() => onDetail({ id: 55 })}>Ver reserva</button></div> : null,
}))
jest.mock('@/components/tables/TableDetailModal', () => ({
  ...jest.requireActual('@/components/tables/TableDetailModal'),
  TableDetailModal: ({ open, tableName, orderId, onChangeTable, onSendPending, onAttendCall, onServe, onNewOrder }: { open: boolean; tableName: string; orderId: number | null; onChangeTable: (d: unknown) => void; onSendPending?: (id: number) => Promise<void>; onAttendCall?: () => Promise<void>; onServe?: (lines: { id: number }[]) => Promise<void>; onNewOrder: () => void }) => open ? (
    <div role="dialog" aria-label={`Detalle mesa ${tableName}`}>
      <button type="button" onClick={() => onChangeTable({ id: orderId, tracking: '0007', reference: 'R', serviceAt: 'table', customerName: 'Ana', dateOrder: '2026-10-04 12:00:00', total: 50000, sent: 1, served: 0, lines: [] })}>Cambiar de mesa</button>
      <button type="button" onClick={onNewOrder}>Agregar ronda</button>
      {onSendPending && <button type="button" onClick={() => void onSendPending(orderId!)}>Enviar pendientes</button>}
      {onAttendCall && <button type="button" onClick={() => void onAttendCall()}>Atender llamada</button>}
      {onServe && <button type="button" onClick={() => void onServe([{ id: 81 }, { id: 82 }])}>Servir platos</button>}
    </div>
  ) : null,
}))

const order = (id: number, tableId: number) => ({ id, tableId, total: 50000, tax: 0, state: 'draft' as const, lineCount: 2, startedAt: '2026-10-04 12:00:00', waiter: 'Luis', kitchen: 'cooking' as never, tracking: null })
const catalog = (floors = [{ id: 1, name: 'Salón', tableIds: [1, 2], hasBackground: false }, { id: 2, name: 'Terraza', tableIds: [3], hasBackground: false }]) => ({
  company: { name: 'Burger' }, products: [], categories: [], paymentMethods: [], floors,
  settings: { configId: 4, configName: 'Caja', waiterCanCharge: false, waiterCanEditInventory: false },
  tables: [1, 2, 3].map((id) => ({ id, number: id, floorId: id === 3 ? 2 : 1, seats: 4, x: 0, y: 0, width: 1, height: 1, shape: 'square', color: null })),
}) as never
const load = jest.fn(async () => undefined)
const attendCall = jest.fn(async () => undefined)
const refreshShift = jest.fn(async () => undefined)

function as(role: 'owner' | 'admin' | 'cashier' | 'waiter', session: boolean = true) {
  useAuthStore.setState({ user: { uid: 1, name: 'Persona', companyId: 1, role } as never, employee: { role, name: 'Persona' } as never, session: session ? { id: 9, configId: 4, state: 'opened' } : null })
}
// Renderiza y deja asentar las lecturas iniciales (turno y reservas del día).
async function wrap() {
  const view = render(<NextIntlClientProvider locale="es" messages={messages}><SalonPage /></NextIntlClientProvider>)
  await act(async () => { await Promise.resolve() })
  return view
}
const table = (n: number) => screen.getByRole('button', { name: `Mesa ${n}` })

beforeEach(() => {
  jest.clearAllMocks()
  mockAsked = null
  useNetworkStore.setState({ online: true, since: null })
  useFloorStore.setState({ activeFloorId: null, secondFloorId: null, split: false, selectedTableId: null })
  useCatalogStore.setState({ catalog: catalog(), load })
  useOrderStore.setState({ openOrders: [order(7, 1)], calls: [], flags: {}, busy: false, attendCall, refreshShift })
})

// Falla si sin carta la pantalla intenta pintar el plano (se rompería) en vez del esqueleto de carga.
it('sin carta muestra el esqueleto de carga', async () => {
  as('waiter')
  useCatalogStore.setState({ catalog: null })
  await wrap()
  expect(screen.queryByRole('region', { name: 'Piso Salón' })).toBeNull()
  expect(screen.queryByRole('heading', { name: 'Mesas' })).toBeNull()
})

// Falla si sin caja abierta el plano muestra mesas ocupadas o pedidos del turno anterior, o deja crear pedidos desde
// la mesa elegida.
it('sin caja abierta el plano sale libre y sin barra de pedido', async () => {
  as('waiter', false)
  await wrap()
  expect(table(1)).toHaveAttribute('data-state', 'free')
  expect(screen.getByText('0 pedidos en servicio')).toBeInTheDocument()
  fireEvent.click(table(1))
  expect(screen.queryByRole('toolbar')).toBeNull()
  expect(screen.queryByText('Mesas con servicio')).toBeNull()
  expect(refreshShift).not.toHaveBeenCalled()
})

// Falla si una mesa libre no abre el asistente con su mesa, si una ocupada no agrega ronda a su pedido, o si volver a
// tocar la mesa elegida no la suelta.
it('crear pedido va al asistente de la mesa libre o a la ronda de la ocupada', async () => {
  as('waiter')
  await wrap()
  await waitFor(() => expect(refreshShift).toHaveBeenCalledWith(9))
  expect(table(1)).not.toHaveAttribute('data-state', 'free')
  expect(table(1)).toHaveTextContent('DI7')
  expect(table(2)).toHaveTextContent('')
  fireEvent.click(table(2))
  fireEvent.click(within(screen.getByRole('toolbar', { name: 'Mesa seleccionada 2' })).getByRole('button', { name: 'Crear pedido' }))
  expect(push).toHaveBeenLastCalledWith('/salon/nuevo?mesa=2')
  fireEvent.click(table(1))
  fireEvent.click(screen.getByRole('button', { name: 'Crear pedido' }))
  expect(push).toHaveBeenLastCalledWith('/salon/7/agregar')
  fireEvent.click(table(1))
  expect(screen.queryByRole('toolbar')).toBeNull()
})

// Falla si en modo emergencia el mesero puede seguir tomando pedidos (plan V: solo la caja), o si la caja pierde esa
// opción.
it('en emergencia solo la caja crea pedidos', async () => {
  useNetworkStore.setState({ online: false, since: Date.now() - 4 * 60_000 })
  as('waiter')
  const first = await wrap()
  fireEvent.click(table(2))
  expect(screen.getByRole('toolbar', { name: 'Mesa seleccionada 2' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Crear pedido' })).toBeNull()
  first.unmount()
  as('cashier')
  await wrap()
  expect(screen.getByRole('button', { name: 'Crear pedido' })).toBeInTheDocument()
})

// Falla si un restaurante que quita «crear pedidos» al mesero no se respeta en el salón.
it('respeta la política del restaurante para crear pedidos', async () => {
  as('waiter')
  useCatalogStore.setState({ catalog: { ...(catalog() as object), settings: { configId: 4, rolePermissions: { waiter: { views: ['tables'], actions: [] }, cashier: { views: [], actions: [] }, admin: { views: [], actions: [] } } } } as never })
  await wrap()
  fireEvent.click(table(2))
  expect(screen.queryByRole('button', { name: 'Crear pedido' })).toBeNull()
})

// Falla si el mesero ve los ajustes de pisos (son del encargado) o si al encargado no se le carga la lista de pisos
// de su caja.
it('los ajustes de pisos son del encargado', async () => {
  as('waiter')
  const first = await wrap()
  expect(screen.queryByRole('button', { name: /Ajustes de mesas/ })).toBeNull()
  first.unmount()
  as('admin')
  jest.mocked(listAllFloors).mockResolvedValue([{ id: 1, name: 'Salón', active: true, tableCount: 2 }])
  await wrap()
  fireEvent.click(screen.getByRole('button', { name: /Ajustes de mesas/ }))
  await waitFor(() => expect(listAllFloors).toHaveBeenCalledWith(4))
  expect(await screen.findByRole('button', { name: 'Editar Salón' })).toBeInTheDocument()
})

// Falla si un error al leer los pisos deja la pantalla sin aviso, o si un local sin pisos esconde los ajustes al
// encargado (no podría crear el primero).
it('sin pisos el encargado puede abrir los ajustes y un error avisa', async () => {
  as('admin')
  useCatalogStore.setState({ catalog: catalog([]) })
  jest.mocked(listAllFloors).mockRejectedValueOnce(new Error('sin red'))
  await wrap()
  fireEvent.click(screen.getByRole('button', { name: /Ajustes de mesas/ }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger', title: expect.stringMatching(/lista de pisos/) })))
})

// Falla si con la caja abierta se puede editar, crear o eliminar un piso (rompería los pedidos en curso).
it('con caja abierta no se edita, crea ni elimina un piso', async () => {
  as('admin')
  jest.mocked(listAllFloors).mockResolvedValue([{ id: 1, name: 'Salón', active: true, tableCount: 2 }])
  await wrap()
  fireEvent.click(screen.getByRole('button', { name: /Ajustes de mesas/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Editar Salón' }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar piso' }))
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Salón' }))
  await waitFor(() => expect(toast).toHaveBeenCalledTimes(3))
  expect(jest.mocked(toast).mock.calls.every(([t]) => t.tone === 'danger')).toBe(true)
  expect(readPlan).not.toHaveBeenCalled()
  expect(deleteFloor).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog', { name: /Editor/ })).toBeNull()
})

// Falla si con la caja cerrada el piso nuevo no abre el editor, o si guardar no recarga la carta ni muestra el piso
// guardado.
it('con caja cerrada crea un piso y al guardar lo muestra', async () => {
  as('admin', false)
  await wrap()
  fireEvent.click(screen.getByRole('button', { name: /Ajustes de mesas/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar piso' }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar plano' }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Plano guardado' }))
  expect(load).toHaveBeenCalledWith(null)
  expect(mockRefreshOrders).toHaveBeenCalled()
  expect(useFloorStore.getState().activeFloorId).toBe(2)
  expect(screen.getByRole('region', { name: 'Piso Terraza' })).toBeInTheDocument()
})

// Falla si editar un piso no lee su plano, si un error no avisa, o si cancelar el editor no vuelve al salón.
it('edita un piso existente y vuelve al cancelar', async () => {
  as('admin', false)
  jest.mocked(listAllFloors).mockResolvedValue([{ id: 1, name: 'Salón', active: true, tableCount: 2 }])
  jest.mocked(readPlan).mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ id: 1, name: 'Salón', revision: 3, tables: [], walls: [], zones: [] } as never)
  await wrap()
  fireEvent.click(screen.getByRole('button', { name: /Ajustes de mesas/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Editar Salón' }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ tone: 'danger' })))
  fireEvent.click(screen.getByRole('button', { name: 'Editar Salón' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Salir del editor' }))
  expect(readPlan).toHaveBeenCalledWith(1)
  expect(screen.getByRole('region', { name: 'Piso Salón' })).toBeInTheDocument()
})

// Falla si eliminar el piso que se está mirando deja la pantalla en un piso que ya no existe, si no avisa que las
// ventas quedan en el historial, o si un error del servidor pasa en silencio.
it('elimina el piso activo y pasa al siguiente', async () => {
  as('admin', false)
  useFloorStore.setState({ activeFloorId: 1 })
  jest.mocked(listAllFloors).mockResolvedValue([{ id: 1, name: 'Salón', active: true, tableCount: 2 }])
  jest.mocked(deleteFloor).mockResolvedValueOnce({ id: 1, result: 'archived' } as never).mockRejectedValueOnce(new Error('PIN inválido'))
  await wrap()
  fireEvent.click(screen.getByRole('button', { name: /Ajustes de mesas/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Salón' }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Piso eliminado. Sus ventas siguen en el historial.' }))
  expect(deleteFloor).toHaveBeenCalledWith(4, 1)
  expect(useFloorStore.getState().activeFloorId).toBe(2)
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar Salón' }))
  await waitFor(() => expect(toast).toHaveBeenLastCalledWith({ title: 'No se pudo eliminar el piso', body: 'PIN inválido', tone: 'danger' }))
})

// Falla si desactivar un piso no relee pisos y carta, o si el rechazo por caja abierta no explica qué hacer.
it('activa o desactiva un piso y explica el rechazo por caja abierta', async () => {
  as('admin')
  jest.mocked(listAllFloors).mockResolvedValue([{ id: 2, name: 'Terraza', active: true, tableCount: 1 }])
  jest.mocked(setFloorActive).mockResolvedValueOnce(undefined as never).mockRejectedValueOnce(new Error('Hay una PoS Session abierta')).mockRejectedValueOnce(new Error('500'))
  await wrap()
  fireEvent.click(screen.getByRole('button', { name: /Ajustes de mesas/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Desactivar Terraza' }))
  await waitFor(() => expect(load).toHaveBeenCalledWith(9))
  expect(setFloorActive).toHaveBeenCalledWith(2, false)
  expect(listAllFloors).toHaveBeenCalledTimes(2)
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar Terraza' }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Hay una caja abierta', body: 'Cierra el turno en Ventas antes de activar o desactivar «Terraza».', tone: 'danger' }))
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar Terraza' }))
  await waitFor(() => expect(toast).toHaveBeenLastCalledWith({ title: 'No se pudo cambiar el piso', body: '', tone: 'danger' }))
})

// Falla si mover un pedido no lo lleva a la mesa elegida, si no recarga el salón, o si después no queda elegida la mesa
// nueva.
it('cambia un pedido de mesa', async () => {
  as('waiter')
  await wrap()
  fireEvent.click(table(1))
  fireEvent.click(screen.getByRole('button', { name: 'Detalle de mesa' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Detalle mesa 1' })).getByRole('button', { name: 'Cambiar de mesa' }))
  expect(screen.getByRole('toolbar', { name: 'Cambiar mesa' })).toHaveTextContent('Elige la mesa nueva para el pedido DI0007')
  expect(screen.getByRole('region', { name: 'Piso Salón' })).toHaveAttribute('data-pick-free', 'true')
  expect(table(1)).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(table(2))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Cambiar mesa' })).getByRole('button', { name: 'Confirmar cambio' }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'Pedido movido a la mesa 2' }))
  expect(moveOrder).toHaveBeenCalledWith(7, 2)
  expect(load).toHaveBeenCalledWith(9)
  expect(useFloorStore.getState().selectedTableId).toBe(2)
  expect(screen.queryByRole('toolbar', { name: 'Cambiar mesa' })).toBeNull()
})

// Falla si mover a una mesa ocupada no lo dice con su nombre, si otro error no avisa, o si cancelar el cambio no
// devuelve el salón a la normalidad.
it('avisa si la mesa nueva está ocupada y permite cancelar el cambio', async () => {
  as('waiter')
  jest.mocked(moveOrder).mockRejectedValueOnce(new Error('La mesa ya tiene un pedido abierto')).mockRejectedValueOnce(new Error('500'))
  await wrap()
  fireEvent.click(table(1))
  fireEvent.click(screen.getByRole('button', { name: 'Detalle de mesa' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cambiar de mesa' }))
  fireEvent.click(table(2))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }))
  await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: 'La mesa 2 ya tiene un pedido.', tone: 'danger' }))
  expect(screen.queryByRole('dialog', { name: 'Cambiar mesa' })).toBeNull()
  fireEvent.click(table(2))
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }))
  await waitFor(() => expect(toast).toHaveBeenLastCalledWith({ title: 'No se pudo mover el pedido.', tone: 'danger' }))
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar cambio' }))
  expect(screen.queryByRole('toolbar', { name: 'Cambiar mesa' })).toBeNull()
  expect(useFloorStore.getState().selectedTableId).toBe(1)
})

// Falla si desde el detalle de mesa el mesero no puede enviar lo pendiente a cocina, servir los platos o atender la
// llamada, o si después no se releen los pedidos.
it('el mesero envía, sirve y atiende desde el detalle de mesa', async () => {
  as('waiter')
  useOrderStore.setState({ calls: [{ tableId: 1, kind: 'waiter' as never, since: '' }] })
  await wrap()
  fireEvent.click(table(1))
  fireEvent.click(screen.getByRole('button', { name: 'Detalle de mesa' }))
  fireEvent.click(screen.getByRole('button', { name: 'Enviar pendientes' }))
  await waitFor(() => expect(fireUnsentLines).toHaveBeenCalledWith(7))
  fireEvent.click(screen.getByRole('button', { name: 'Servir platos' }))
  await waitFor(() => expect(serveLines).toHaveBeenCalledWith([81, 82]))
  fireEvent.click(screen.getByRole('button', { name: 'Atender llamada' }))
  await waitFor(() => expect(attendCall).toHaveBeenCalledWith(1))
  await waitFor(() => expect(mockRefreshOrders).toHaveBeenCalledTimes(3))
  fireEvent.click(screen.getByRole('button', { name: 'Agregar ronda' }))
  expect(push).toHaveBeenCalledWith('/salon/7/agregar')
})

// Falla si el cajero (sin el permiso de servir) puede marcar platos servidos o atender llamadas desde el salón.
it('el cajero no sirve ni atiende llamadas', async () => {
  as('cashier')
  await wrap()
  fireEvent.click(table(1))
  fireEvent.click(screen.getByRole('button', { name: 'Detalle de mesa' }))
  const detail = screen.getByRole('dialog', { name: 'Detalle mesa 1' })
  expect(within(detail).queryByRole('button', { name: 'Servir platos' })).toBeNull()
  expect(within(detail).queryByRole('button', { name: 'Atender llamada' })).toBeNull()
  expect(within(detail).getByRole('button', { name: 'Enviar pendientes' })).toBeInTheDocument()
})

// Falla si abrir una mesa de otro piso desde la lista de servicio no cambia el plano a ese piso ni abre su detalle.
it('la lista de servicio abre una mesa de otro piso', async () => {
  as('waiter')
  await wrap()
  expect(screen.getByText('Mesas con servicio')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Servicio mesa 3' }))
  await act(async () => { await Promise.resolve() })
  expect(screen.getByRole('region', { name: 'Piso Terraza' })).toBeInTheDocument()
  expect(screen.getByRole('dialog', { name: 'Detalle mesa 3' })).toBeInTheDocument()
})

// Falla si las reservas del día no se piden para las mesas que se ven, si la mesa reservada no lo indica, o si el
// detalle de una reserva no se abre.
it('consulta las reservas del día y abre su detalle', async () => {
  as('waiter')
  jest.mocked(reservedAtByTable).mockResolvedValue({ 2: { id: 55 } as never })
  await wrap()
  await waitFor(() => expect(reservedAtByTable).toHaveBeenCalledWith([1, 2], new Date().toLocaleDateString('en-CA')))
  fireEvent.click(table(2))
  expect(await screen.findByText('Reservada')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Info de reserva' }))
  fireEvent.click(screen.getByRole('button', { name: 'Ver reserva' }))
  expect(getReservationDetail).toHaveBeenCalledWith(55)
  expect(screen.queryByRole('dialog', { name: 'Reservas' })).toBeNull()
})

// Falla si un error al leer reservas rompe el salón en vez de mostrar las mesas sin reserva.
it('si las reservas fallan, el salón sigue sin reservas', async () => {
  as('waiter')
  jest.mocked(reservedAtByTable).mockRejectedValueOnce(new Error('sin red'))
  await wrap()
  fireEvent.click(table(2))
  expect(screen.queryByText('Reservada')).toBeNull()
})

// Falla si la pantalla partida no muestra dos pisos distintos, si cerrar un panel no deja el piso del otro, o si con
// un solo piso se ofrece partir.
it('parte la pantalla en dos pisos y la vuelve a unir', async () => {
  as('waiter')
  await wrap()
  fireEvent.click(screen.getByRole('button', { name: 'Dividir la pantalla' }))
  await act(async () => { await Promise.resolve() })
  expect(screen.getByRole('region', { name: 'Piso Salón' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Piso Terraza' })).toBeInTheDocument()
  fireEvent.click(within(screen.getByRole('region', { name: 'Piso Terraza' })).getByRole('button', { name: 'Cerrar este panel' }))
  expect(screen.queryByRole('region', { name: 'Piso Terraza' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Dividir la pantalla' }))
  fireEvent.click(within(screen.getByRole('region', { name: 'Piso Salón' })).getByRole('button', { name: 'Cerrar este panel' }))
  await act(async () => { await Promise.resolve() })
  expect(screen.getByRole('region', { name: 'Piso Terraza' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'Piso Salón' })).toBeNull()
})

// Falla si con un solo piso se ofrece la pantalla partida.
it('con un solo piso no se ofrece partir la pantalla', async () => {
  as('waiter')
  useCatalogStore.setState({ catalog: catalog([{ id: 1, name: 'Salón', tableIds: [1, 2], hasBackground: false }]) })
  await wrap()
  expect(screen.queryByRole('button', { name: 'Dividir la pantalla' })).toBeNull()
})

// Falla si al llegar con ?elegir=mesa queda elegida una mesa de antes, no se pide elegir una, o la dirección conserva
// el parámetro (volvería a preguntar al recargar).
it('al pedir mesa desde otra pantalla suelta la anterior y pregunta', async () => {
  as('waiter')
  mockAsked = 'mesa'
  useFloorStore.setState({ selectedTableId: 1 })
  await wrap()
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/salon'))
  expect(useFloorStore.getState().selectedTableId).toBeNull()
  const prompt = screen.getByRole('dialog')
  expect(prompt).toHaveTextContent('¿De qué mesa es el pedido?')
  expect(within(prompt).getByRole('link', { name: 'Es para llevar o a domicilio' })).toHaveAttribute('href', '/salon/nuevo?sinMesa=1')
  fireEvent.click(within(prompt).getByRole('button', { name: 'Elegir en el plano' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

// Falla si la lista de servicio muestra mesas que el filtro de zona del plano dejó fuera.
it('la lista de servicio sigue la zona filtrada en el plano', async () => {
  as('waiter')
  await wrap()
  expect(screen.getByText('Mesas a la vista: 1,2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Filtrar zona de Salón' }))
  expect(screen.getByText('Mesas a la vista: 1')).toBeInTheDocument()
})
