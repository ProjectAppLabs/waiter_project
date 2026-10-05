import { act, fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ReservationListModal } from '@/components/reservations/ReservationListModal'
import type { ReservationCard } from '@/lib/domain/reservations'
import { messages } from '@/lib/i18n/messages'
import { listByTable } from '@/lib/services/reservations'

jest.mock('@/lib/services/reservations', () => ({ listByTable: jest.fn() }))
const wrap = (ui: React.ReactElement) => <NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>
const row = (id: number, customerName: string): ReservationCard => ({
  id, name: `RV${id}`, customerName, people: 2, babyChair: false, state: 'confirmed', date: '2030-10-15', timeStart: 20, timeEnd: 21,
  label: '20:00', timeLabel: '20:00 – 21:00', tableId: 4, tableNumber: 4, tableNumbers: [4], tableIds: [4], prepMinutes: '30', depositState: 'none', floorId: 1, floorName: 'Salón',
})

beforeEach(() => jest.clearAllMocks())

// Falla si el modal no pide las reservas de la mesa abierta, si no muestra cliente, fecha y hora, o si «Detalle» no
// abre la reserva de esa fila.
it('lista las reservas de la mesa y abre el detalle de la elegida', async () => {
  jest.mocked(listByTable).mockResolvedValue([row(1, 'Eva'), row(2, 'Luis')])
  const onOpenDetail = jest.fn()
  render(wrap(<ReservationListModal tableId={4} open onClose={jest.fn()} onOpenDetail={onOpenDetail} />))
  expect(screen.getByText('Cargando…')).toBeInTheDocument()
  expect(await screen.findByText('Eva')).toBeInTheDocument()
  expect(listByTable).toHaveBeenCalledWith(4)
  expect(screen.getAllByText('20:00 – 21:00')).toHaveLength(2)
  expect(screen.getAllByText(/15 de oct/)).toHaveLength(2)
  fireEvent.click(screen.getAllByRole('button', { name: 'Detalle' })[1])
  expect(onOpenDetail).toHaveBeenCalledWith(2)
})

// Falla si un error del servidor deja el modal cargando para siempre en vez de mostrar el estado vacío.
it('si la carga falla muestra que la mesa no tiene reservas', async () => {
  jest.mocked(listByTable).mockRejectedValue(new Error('caído'))
  render(wrap(<ReservationListModal tableId={4} open onClose={jest.fn()} onOpenDetail={jest.fn()} />))
  expect(await screen.findByText('Sin reservas')).toBeInTheDocument()
  expect(screen.getByText('Esta mesa no tiene reservas activas.')).toBeInTheDocument()
})

// Falla si al cambiar de mesa el modal muestra un momento las reservas de la anterior, o si una respuesta tardía de la
// mesa anterior pisa la de la nueva.
it('al cambiar de mesa no muestra las reservas de la anterior', async () => {
  let resolveOld: (r: ReservationCard[]) => void = () => undefined
  jest.mocked(listByTable).mockImplementation((id) => (id === 4 ? new Promise((r) => { resolveOld = r }) : Promise.resolve([row(9, 'Nueva')])))
  const view = render(wrap(<ReservationListModal tableId={4} open onClose={jest.fn()} onOpenDetail={jest.fn()} />))
  view.rerender(wrap(<ReservationListModal tableId={5} open onClose={jest.fn()} onOpenDetail={jest.fn()} />))
  expect(await screen.findByText('Nueva')).toBeInTheDocument()
  await act(async () => { resolveOld([row(1, 'Vieja')]) })
  expect(screen.queryByText('Vieja')).not.toBeInTheDocument()
})

// Falla si el modal pide reservas cerrado o sin mesa (llamadas de más al abrir el plano).
it('cerrado o sin mesa no pide nada', () => {
  render(wrap(<ReservationListModal tableId={null} open onClose={jest.fn()} onOpenDetail={jest.fn()} />))
  render(wrap(<ReservationListModal tableId={4} open={false} onClose={jest.fn()} onOpenDetail={jest.fn()} />))
  expect(listByTable).not.toHaveBeenCalled()
})
