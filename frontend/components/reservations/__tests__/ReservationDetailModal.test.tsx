import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ReservationDetailModal } from '@/components/reservations/ReservationDetailModal'
import { messages } from '@/lib/i18n/messages'
import { readPlan } from '@/lib/services/floorPlan'
import { getAvailableTables, getReservation, setReservationTables, type AvailableTable, type ReservationDetail } from '@/lib/services/reservations'

jest.mock('@/lib/services/reservations', () => ({ ...jest.requireActual('@/lib/services/reservations'), getReservation: jest.fn(), getAvailableTables: jest.fn(), setReservationTables: jest.fn() }))
jest.mock('@/lib/services/floorPlan', () => ({ readPlan: jest.fn() }))
jest.mock('@/lib/stores/catalogStore', () => ({ useCatalogStore: (select: (s: unknown) => unknown) => select({ catalog: { floors: [{ id: 2, name: 'Terraza', tableIds: [1, 2, 3], hasBackground: false }],
  tables: [1, 2, 3].map((n) => ({ id: n, number: n, floorId: 2, seats: 4, x: n * 150, y: 40, width: 110, height: 110, shape: 'square', color: null })) } }) }))

const detail = (tableNumbers: number[]): ReservationDetail => ({
  id: 7, name: 'RV103', customerName: 'Grupo', people: 7, babyChair: false, state: 'confirmed', date: '2030-10-15', timeStart: 20, timeEnd: 21.5, label: '20:00', timeLabel: '20:00 – 21:30',
  tableId: 1, tableNumber: tableNumbers[0], tableNumbers, tableIds: tableNumbers, prepMinutes: '30', floorId: 2, floorName: 'Terraza', customerEmail: '', customerPhone: '', notes: '', amountTotal: 0, lines: [],
  depositAmount: 0, depositState: 'none', depositReference: '', depositPaidAt: '', payToken: '', payUrl: '', restaurantName: 'Burger House',
})

// Falla si el detalle de una reserva de grupo deja de nombrar todas sus mesas. next-intl no lanza por una clave que
// falta: pinta la ruta de la clave, así que se comprueba el texto real (el fallo llegó a verse en el navegador como
// «reservations.detail.tablesLabel»).
it('names every table of a group reservation, and a single one as before', async () => {
  const onError = jest.fn()
  const mount = (numbers: number[]) => {
    jest.mocked(getReservation).mockResolvedValue(detail(numbers))
    return render(<NextIntlClientProvider locale="es" messages={messages} onError={onError}><ReservationDetailModal reservationId={7} open onClose={jest.fn()} onAction={jest.fn()} /></NextIntlClientProvider>)
  }
  const first = mount([2, 5, 9])
  expect(await screen.findByLabelText('Mesas 2, 5 y 9')).toBeInTheDocument()
  first.unmount()
  mount([4])
  expect(await screen.findByLabelText('Mesa 4')).toBeInTheDocument()
  expect(onError).not.toHaveBeenCalled()
})

// Falla si no se pueden cambiar las mesas de una reserva confirmada desde su detalle: que abra con las mesas que ya
// tiene, que la disponibilidad se pida sin contar a la propia reserva (si no, sus mesas saldrían «reservadas» y no
// podría conservarlas), que guarde la selección nueva y que avise para recargar la grilla.
it('changes the tables of a confirmed reservation from its detail', async () => {
  const available = (id: number, status: AvailableTable['status']): AvailableTable => ({ id, tableNumber: id, name: `Mesa ${id}`, seats: 4, floorId: 2, floorName: 'Terraza', shape: 'square', status, available: status === 'available', reservedAt: status === 'reserved' ? '19:00' : false })
  jest.mocked(readPlan).mockResolvedValue({ id: 2, name: 'Terraza', revision: 1, tables: [], walls: [], zones: [] })
  jest.mocked(getReservation).mockResolvedValue(detail([1, 2]))
  jest.mocked(getAvailableTables).mockResolvedValue([available(1, 'available'), available(2, 'available'), available(3, 'available')])
  jest.mocked(setReservationTables).mockResolvedValue(detail([1, 3]))
  const onChanged = jest.fn()
  render(<NextIntlClientProvider locale="es" messages={messages}><ReservationDetailModal reservationId={7} open onClose={jest.fn()} configId={1} onChanged={onChanged} /></NextIntlClientProvider>)
  fireEvent.click(await screen.findByRole('button', { name: 'Cambiar mesas' }))
  expect(await screen.findByRole('dialog', { name: 'Cambiar mesas · reserva RV103' })).toBeInTheDocument()
  expect(getAvailableTables).toHaveBeenCalledWith(1, '2030-10-15', 20, 7, '30', 7)
  expect(await screen.findByRole('button', { name: 'Quitar la mesa 2' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: 'Quitar la mesa 2' }))
  expect(screen.getByRole('button', { name: 'Guardar mesas' })).toBeDisabled() // 4 puestos para 7: aún no caben
  fireEvent.click(screen.getByRole('button', { name: /^Mesa 3/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar mesas' }))
  await waitFor(() => expect(setReservationTables).toHaveBeenCalledWith(7, [1, 3]))
  expect(await screen.findByLabelText('Mesas 1 y 3')).toBeInTheDocument()
  expect(onChanged).toHaveBeenCalled()
})

// Falla si una reserva que ya se sentó o se canceló ofrece cambiar mesas (el servidor lo rechazaría), o si el detalle
// que abre el salón —sin terminal— lo ofrece.
it('only offers to change tables on a confirmed reservation opened with a terminal', async () => {
  jest.mocked(getReservation).mockResolvedValue({ ...detail([4]), state: 'seated' })
  const seated = render(<NextIntlClientProvider locale="es" messages={messages}><ReservationDetailModal reservationId={7} open onClose={jest.fn()} configId={1} /></NextIntlClientProvider>)
  expect(await screen.findByLabelText('Mesa 4')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cambiar mesas' })).not.toBeInTheDocument()
  seated.unmount()
  jest.mocked(getReservation).mockResolvedValue(detail([4]))
  render(<NextIntlClientProvider locale="es" messages={messages}><ReservationDetailModal reservationId={7} open onClose={jest.fn()} /></NextIntlClientProvider>)
  expect(await screen.findByLabelText('Mesa 4')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Cambiar mesas' })).not.toBeInTheDocument()
})
