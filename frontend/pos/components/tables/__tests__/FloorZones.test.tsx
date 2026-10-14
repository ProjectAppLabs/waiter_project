import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { FloorZones } from '@/components/tables/FloorZones'
import type { FloorDocument } from '@/lib/domain/floorPlan'
import { messages } from '@/lib/i18n/messages'
import { listPosEmployees } from '@/lib/services/employees'
import { assignZoneStaff, assignZones, readZoneStaff } from '@/lib/services/floorPlan'
import { useAuthStore } from '@/lib/stores/authStore'

jest.mock('@/lib/services/floorPlan', () => ({ assignZones: jest.fn(), assignZoneStaff: jest.fn(), readZoneStaff: jest.fn() }))
jest.mock('@/lib/services/employees', () => ({ listPosEmployees: jest.fn() }))
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: jest.fn() }))
let role = 'admin'
jest.mock('@/lib/hooks/useIdentity', () => ({ useIdentity: () => ({ role }) }))
jest.mock('@/lib/stores/orderStore', () => ({ useOrderStore: (select: (s: { calls: unknown[] }) => unknown) => select({ calls: [] }) }))

const plan: FloorDocument = { id: 2, name: 'Terraza', revision: 1, walls: [], zones: [{ id: 'z', name: 'Ventana', color: '#3b82f6', x: 0, y: 0, width: 800, height: 600 }],
  tables: [{ id: 3, key: '3', number: 3, seats: 4, zone: 'z', x: 100, y: 100, width: 120, height: 120 }] }
const auth = (session: { id: number; configId: number } | null) => (useAuthStore as unknown as jest.Mock).mockImplementation((select) => select({ session, employee: { id: 4 } }))
const mount = (p = plan, extra: { onFilter?: jest.Mock; onStaff?: jest.Mock } = {}) => render(
  <NextIntlClientProvider locale="es" messages={messages}><FloorZones plan={p} floorName="Terraza" configId={1} onFilter={extra.onFilter ?? jest.fn()} onStaff={extra.onStaff} /></NextIntlClientProvider>)

beforeEach(() => {
  jest.clearAllMocks(); role = 'admin'
  ;(listPosEmployees as jest.Mock).mockResolvedValue([{ id: 4, name: 'Sofía Mesera', role: 'waiter' }, { id: 5, name: 'Laura Encargada', role: 'admin' }])
  ;(readZoneStaff as jest.Mock).mockResolvedValue({ assignments: {}, source: 'plan', plan: {} })
  ;(assignZones as jest.Mock).mockResolvedValue({}); (assignZoneStaff as jest.Mock).mockResolvedValue({})
})

// Falla si repartir meseros vuelve a exigir caja abierta: con la caja cerrada se guarda el reparto habitual del piso
// y no se toca ningún turno.
it('prepares the usual staff with the cash register closed', async () => {
  auth(null)
  mount()
  fireEvent.click(await screen.findByRole('button', { name: /Meseros por zona/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Meseros por zona · Terraza' })
  expect(within(dialog).getByText(/cada turno empieza con él/)).toBeInTheDocument()
  expect(within(dialog).queryByLabelText('Guardar también como reparto habitual')).not.toBeInTheDocument()
  expect(within(dialog).getByRole('button', { name: 'Guardar reparto' })).toBeDisabled()
  // El rol se lee traducido en la ficha (salía la clave cruda «pos.roles.admin»).
  expect(within(within(dialog).getByRole('button', { name: 'Laura Encargada en Ventana' })).getByText('Encargado')).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Sofía Mesera en Ventana' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Laura Encargada en Ventana' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar reparto' }))
  await waitFor(() => expect(assignZoneStaff).toHaveBeenCalledWith(1, 2, { z: [4, 5] }))
  expect(assignZones).not.toHaveBeenCalled()
  expect(readZoneStaff).toHaveBeenCalledWith(2, null)
})

// Falla si ajustar el turno pisa el reparto habitual sin pedirlo, si la casilla deja de guardarlo cuando sí se pide,
// o si «Mis zonas» deja de filtrar las mesas del empleado.
it('adjusts only the open shift unless asked to keep it as the usual staff, and filters my zones', async () => {
  auth({ id: 29, configId: 1 })
  const onFilter = jest.fn(), onStaff = jest.fn()
  mount(plan, { onFilter, onStaff })
  fireEvent.click(await screen.findByRole('button', { name: /1 zona sin mesero/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Sofía Mesera en Ventana' }))
  ;(readZoneStaff as jest.Mock).mockResolvedValue({ assignments: { z: [4] }, source: 'shift', plan: {} })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reparto' }))
  await waitFor(() => expect(assignZones).toHaveBeenCalledWith(29, 2, { z: [4] }))
  expect(assignZoneStaff).not.toHaveBeenCalled()
  await waitFor(() => expect(onStaff).toHaveBeenLastCalledWith({ z: ['Sofía'] }))
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'mine' } })
  await waitFor(() => expect(onFilter).toHaveBeenLastCalledWith([3]))

  fireEvent.click(screen.getByRole('button', { name: /Meseros por zona/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Laura Encargada en Ventana' }))
  fireEvent.click(screen.getByLabelText('Guardar también como reparto habitual'))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reparto' }))
  await waitFor(() => expect(assignZoneStaff).toHaveBeenCalledWith(1, 2, { z: [4, 5] }))
  // …y el turno vuelve a heredar el habitual en vez de quedarse con una copia que ya no lo seguiría.
  await waitFor(() => expect(assignZones).toHaveBeenLastCalledWith(29, 2, null))
})

// Falla si un turno con reparto propio no puede volver al habitual (assignments = null lo borra en el servidor).
it('lets a shift with its own staff go back to the usual one', async () => {
  auth({ id: 29, configId: 1 })
  ;(readZoneStaff as jest.Mock).mockResolvedValue({ assignments: { z: [5] }, source: 'shift', plan: { z: [4] } })
  mount()
  fireEvent.click(await screen.findByRole('button', { name: /Meseros por zona/ }))
  fireEvent.click(await screen.findByRole('button', { name: 'Volver al reparto habitual' }))
  await waitFor(() => expect(assignZones).toHaveBeenCalledWith(29, 2, null))
})

// Falla si un piso sin zonas vuelve a esconder la opción sin explicar por qué (así parecía que «solo salía en uno»),
// o si esa explicación de administrador le aparece a un mesero.
it('explains how to get zones when the floor has none, only to admins', () => {
  auth(null)
  const { unmount } = mount({ ...plan, zones: [] })
  expect(screen.getByText(/Este piso no tiene zonas/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Meseros por zona/ })).not.toBeInTheDocument()
  unmount(); role = 'waiter'
  const { container } = mount({ ...plan, zones: [] })
  expect(container).toBeEmptyDOMElement()
})
