import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ReservationWizard } from '@/components/reservations/ReservationWizard'
import { emptyDraft } from '@/lib/domain/reservations'
import { messages } from '@/lib/i18n/messages'
import { loadMenuExtras, loadTaxes } from '@/lib/services/productOptions'
import { getSchedule } from '@/lib/services/reservationHours'
import { createReservation, getAvailableTables, getSlots, getTimeline, type AvailableTable, type ReservationDetail } from '@/lib/services/reservations'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { useReservationsStore } from '@/lib/stores/reservationsStore'
import type { Catalog } from '@/lib/types'

jest.mock('@/lib/services/reservations', () => ({ getSlots: jest.fn(), getAvailableTables: jest.fn(), createReservation: jest.fn(), getTimeline: jest.fn(), setReservationState: jest.fn() }))
jest.mock('@/lib/services/reservationHours', () => ({ getSchedule: jest.fn() }))
jest.mock('@/lib/services/productOptions', () => ({ loadMenuExtras: jest.fn(), loadTaxes: jest.fn() }))
jest.mock('@/lib/audio/sounds', () => ({ play: jest.fn() }))
// Los pasos tienen sus propias pruebas: aquí se sustituyen por versiones mínimas para probar cómo el asistente los une.
jest.mock('@/components/reservations/TableStep', () => ({ TableStep: ({ people, time, onSelect, onContinue }: { people: number; time: number; onSelect: (ids: number[]) => void; onContinue: () => void }) => (
  <div><p>{`Paso mesa: ${people} personas a las ${time}`}</p><button onClick={() => onSelect([1, 2])}>Elegir mesas</button><button onClick={onContinue}>Seguir a platos</button></div>
) }))
jest.mock('@/components/orders/MenuStep', () => ({ MenuStep: ({ emptyLabel, onContinue, optionsOf, descriptionOf }: { emptyLabel: string; onContinue: () => void; optionsOf: (id: number) => unknown[]; descriptionOf: (id: number) => string }) => (
  <div><p>{`Opciones: ${optionsOf(10).length} · Descripción: ${descriptionOf(10) || '—'}`}</p><button onClick={onContinue}>{emptyLabel}</button></div>
) }))
jest.mock('@/components/reservations/SummaryStep', () => ({ SummaryStep: ({ tableNumbers, onCreate }: { tableNumbers: (number | string)[]; onCreate: () => void }) => (
  <div><p>{`Mesas: ${tableNumbers.join(' + ')}`}</p><button onClick={onCreate}>Crear prueba</button></div>
) }))
jest.mock('@/components/reservations/DateTimeModal', () => ({ DateTimeModal: ({ open, onClose, schedule, loadSlots, onPick }: { open: boolean; onClose: () => void; schedule: unknown; loadSlots: (d: string) => Promise<unknown>; onPick: (d: string, t: number) => void }) => (open ? (
  <div role="dialog" aria-label="Fecha y hora">
    <button onClick={onClose}>Cancelar fecha</button>
    <p>{schedule ? 'Con horario' : 'Sin horario'}</p>
    <button onClick={() => void loadSlots('2030-10-20')}>Pedir franjas</button>
    <button onClick={() => onPick('2030-10-16', 20)}>Elegir 16 a las 20</button>
  </div>
) : null) }))

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
// Deja que terminen las cargas que el asistente lanza al abrirse (franjas, horario y extras).
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })
const catalog = { products: [{ id: 1, templateId: 10, taxIds: [3] }], categories: [], floors: [], tables: [] } as unknown as Catalog
const available = (id: number, tableNumber: number, floorId: number, floorName: string): AvailableTable => ({ id, tableNumber, name: `Mesa ${tableNumber}`, seats: 4, floorId, floorName, shape: 'square', status: 'available', available: true, reservedAt: false })
const created = { id: 77, name: 'RV077' } as ReservationDetail

beforeEach(() => {
  jest.clearAllMocks()
  useCatalogStore.setState({ catalog })
  useReservationsStore.setState({ open: true, stepIndex: 0, date: '2030-10-15', draft: { ...emptyDraft(), date: '2030-10-15' }, tables: [], lines: [], error: null, busy: false, extras: null, taxes: [] })
  jest.mocked(getSlots).mockResolvedValue([])
  jest.mocked(getSchedule).mockResolvedValue({ rules: [] } as never)
  jest.mocked(loadMenuExtras).mockResolvedValue({ options: new Map(), descriptions: new Map() } as never)
  jest.mocked(loadTaxes).mockResolvedValue([])
  jest.mocked(getTimeline).mockResolvedValue({ date: '2030-10-16', slots: [], floors: [], tables: [] })
})

// Falla si el asistente se pinta cerrado o sin carta, o si al abrirse no pide las franjas del día, el horario del
// local y los extras de la carta (opciones e impuestos de los productos).
it('al abrirse pide franjas, horario y extras de la carta; cerrado no pinta nada', async () => {
  const view = wrap(<ReservationWizard configId={1} onCreated={jest.fn()} />)
  expect(screen.getByText('Nueva reserva')).toBeInTheDocument()
  await settle()
  await waitFor(() => expect(getSlots).toHaveBeenCalledWith(1, '2030-10-15'))
  expect(getSchedule).toHaveBeenCalledWith(1)
  await waitFor(() => expect(loadMenuExtras).toHaveBeenCalledWith([10]))
  expect(loadTaxes).toHaveBeenCalledWith([3])
  await settle()
  act(() => useReservationsStore.setState({ open: false }))
  expect(screen.queryByText('Nueva reserva')).not.toBeInTheDocument()
  view.unmount()
  useCatalogStore.setState({ catalog: null }); useReservationsStore.setState({ open: true })
  wrap(<ReservationWizard configId={1} onCreated={jest.fn()} />)
  await settle()
  expect(screen.queryByText('Nueva reserva')).not.toBeInTheDocument()
})

// Falla si elegir fecha y hora no las guarda en el borrador, si no borra las mesas elegidas para otra hora, si no
// recarga las franjas del día nuevo, o si el selector no recibe el horario y las franjas del local.
it('elegir fecha y hora la guarda, suelta las mesas y recarga las franjas', async () => {
  useReservationsStore.setState({ draft: { ...emptyDraft(), date: '2030-10-15', tableIds: [4] } })
  wrap(<ReservationWizard configId={1} onCreated={jest.fn()} />)
  await settle()
  fireEvent.click(screen.getByText('Elige fecha y hora').closest('button')!)
  expect(await screen.findByText('Con horario')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Pedir franjas' }))
  expect(getSlots).toHaveBeenCalledWith(1, '2030-10-20')
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Elegir 16 a las 20' })) })
  expect(screen.queryByRole('dialog', { name: 'Fecha y hora' })).not.toBeInTheDocument()
  expect(useReservationsStore.getState().draft).toMatchObject({ date: '2030-10-16', timeStart: 20, tableIds: [] })
  await waitFor(() => expect(getSlots).toHaveBeenCalledWith(1, '2030-10-16'))
})

// Falla si un horario que no carga rompe el asistente en vez de dejar el calendario sin días tachados.
it('si el horario no carga el asistente sigue sin él', async () => {
  jest.mocked(getSchedule).mockRejectedValue(new Error('caído'))
  wrap(<ReservationWizard configId={1} onCreated={jest.fn()} />)
  await settle()
  fireEvent.click(screen.getByText('Elige fecha y hora').closest('button')!)
  expect(await screen.findByText('Sin horario')).toBeInTheDocument()
})

// Falla si el paso de mesa no pide las mesas libres para esa hora y ese grupo, si «Volver» no regresa, o si el paso de
// platos no se puede saltar con «Continuar sin platos».
it('avanza por mesa y platos pidiendo las mesas libres, y vuelve atrás', async () => {
  jest.mocked(getAvailableTables).mockResolvedValue([available(1, 4, 1, 'Salón')])
  useReservationsStore.setState({ draft: { ...emptyDraft(), customerName: 'Ana', date: '2030-10-15', timeStart: 19.5, people: 3 } })
  wrap(<ReservationWizard configId={1} onCreated={jest.fn()} />)
  await settle()
  expect(screen.queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  expect(screen.getByText('Paso mesa: 3 personas a las 19.5')).toBeInTheDocument()
  await waitFor(() => expect(getAvailableTables).toHaveBeenCalledWith(1, '2030-10-15', 19.5, 3, '30'))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: 'Elegir mesas' }))
  expect(useReservationsStore.getState().draft.tableIds).toEqual([1, 2])
  fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
  expect(screen.getByText('Datos de la reserva')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
  await settle()
  fireEvent.click(screen.getByRole('button', { name: 'Seguir a platos' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continuar sin platos' }))
  expect(useReservationsStore.getState().stepIndex).toBe(3)
})

// Falla si un grupo con mesas de varios pisos no dice de qué piso es cada mesa en el resumen (los números se repiten
// entre pisos), o si con mesas de un solo piso agrega el piso sin necesidad.
it('el resumen nombra el piso de cada mesa solo cuando el grupo junta varios pisos', async () => {
  const tables = [available(1, 4, 1, 'Salón'), available(2, 4, 2, 'Terraza (exterior)'), available(3, 5, 1, 'Salón')]
  useReservationsStore.setState({ stepIndex: 3, tables, draft: { ...emptyDraft(), customerName: 'Ana', date: '2030-10-15', timeStart: 20, tableIds: [1, 2] } })
  const view = wrap(<ReservationWizard configId={1} onCreated={jest.fn()} />)
  expect(screen.getByText(/^Mesas: 4 \(Salón\) \+ 4 \(Terraza/)).toBeInTheDocument()
  await settle()
  view.unmount()
  useReservationsStore.setState({ draft: { ...useReservationsStore.getState().draft, tableIds: [1, 3] } })
  wrap(<ReservationWizard configId={1} onCreated={jest.fn()} />)
  expect(screen.getByText('Mesas: 4 + 5')).toBeInTheDocument()
  await settle()
})

// Falla si crear la reserva no avisa a la página con la reserva creada, o si un rechazo del servidor no se muestra ni
// deja el asistente abierto para corregir.
it('crear avisa con la reserva creada y un rechazo se muestra como alerta', async () => {
  const onCreated = jest.fn()
  useReservationsStore.setState({ stepIndex: 3, tables: [available(1, 4, 1, 'Salón')], draft: { ...emptyDraft(), customerName: 'Ana', date: '2030-10-15', timeStart: 20, tableIds: [1], depositEnabled: false } })
  jest.mocked(createReservation).mockRejectedValueOnce(new Error('La mesa ya está reservada'))
  wrap(<ReservationWizard configId={1} onCreated={onCreated} />)
  await settle()
  fireEvent.click(screen.getByRole('button', { name: 'Crear prueba' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('La mesa ya está reservada')
  expect(onCreated).not.toHaveBeenCalled()
  jest.mocked(createReservation).mockResolvedValueOnce(created)
  fireEvent.click(screen.getByRole('button', { name: 'Crear prueba' }))
  await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created))
  expect(screen.queryByText('Nueva reserva')).not.toBeInTheDocument()
})

// Falla si el paso de platos no recibe las opciones y descripciones de la carta cargadas al abrir, o si un producto
// sin extras rompe el paso en vez de quedar sin opciones.
it('el paso de platos recibe los extras de la carta', async () => {
  jest.mocked(loadMenuExtras).mockResolvedValue({ options: new Map([[10, [{ id: 1 }, { id: 2 }]]]), descriptions: new Map([[10, 'Con papas']]) } as never)
  useReservationsStore.setState({ stepIndex: 2 })
  wrap(<ReservationWizard configId={1} onCreated={jest.fn()} />)
  expect(await screen.findByText('Opciones: 2 · Descripción: Con papas')).toBeInTheDocument()
  act(() => useReservationsStore.setState({ extras: null }))
  expect(screen.getByText('Opciones: 0 · Descripción: —')).toBeInTheDocument()
})

// Falla si cancelar el selector de fecha y hora no lo cierra o cambia la fecha del borrador.
it('cancelar el selector de fecha lo cierra sin cambiar nada', async () => {
  wrap(<ReservationWizard configId={1} onCreated={jest.fn()} />)
  await settle()
  fireEvent.click(screen.getByText('Elige fecha y hora').closest('button')!)
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar fecha' }))
  expect(screen.queryByRole('dialog', { name: 'Fecha y hora' })).not.toBeInTheDocument()
  expect(useReservationsStore.getState().draft.date).toBe('2030-10-15')
})

// Falla si la «X» no cierra el asistente.
it('la X cierra el asistente', async () => {
  wrap(<ReservationWizard configId={1} onCreated={jest.fn()} />)
  await settle()
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(useReservationsStore.getState().open).toBe(false)
  expect(screen.queryByText('Nueva reserva')).not.toBeInTheDocument()
})
