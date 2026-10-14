import { act, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ReservationDetailModal } from '@/components/tables/ReservationDetailModal'
import { messages } from '@/lib/i18n/messages'
import type { ReservationDetail } from '@/lib/services/tables'

jest.mock('@/lib/services/tables', () => ({ getReservationDetail: jest.fn() }))
const wrap = (ui: React.ReactElement) => <NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>
const detail = (over: Partial<ReservationDetail> = {}): ReservationDetail => ({
  id: 7, name: 'RV007', customerName: 'Eva Ríos', people: 4, babyChair: true, state: 'confirmed', date: '2030-10-15', timeStart: 20, timeEnd: 21,
  label: '20:00', timeLabel: '20:00 – 21:00', tableId: 3, email: '', phone: '3001234567', notes: 'Cumpleaños', tableNumber: 3, tableNumbers: [3, 5],
  amountTotal: 54000, lines: [{ id: 1, productTemplateId: 12, name: 'Hamburguesa', qty: 2, unitPrice: 27000, total: 54000, note: 'Sin cebolla' }], ...over,
})

// Falla si el detalle deja de mostrar el código, las mesas, el cliente, las personas, la silla de bebé, las notas, el
// teléfono o el pre-pedido con su nota, precio, cantidad y total.
it('muestra la reserva con sus mesas, el cliente y el pre-pedido', async () => {
  const load = jest.fn(async () => detail())
  render(wrap(<ReservationDetailModal open onClose={jest.fn()} reservationId={7} load={load} />))
  expect(screen.getByRole('status')).toHaveTextContent('Cargando')
  expect(await screen.findByText('RV007')).toBeInTheDocument()
  expect(load).toHaveBeenCalledWith(7)
  expect(screen.getByText('3')).toBeInTheDocument(); expect(screen.getByText('5')).toBeInTheDocument()
  expect(screen.getByText('Eva Ríos')).toBeInTheDocument()
  expect(screen.getByText('4')).toBeInTheDocument()
  expect(screen.getByText('Sí')).toBeInTheDocument()
  expect(screen.getByText('Cumpleaños')).toBeInTheDocument()
  expect(screen.getByText('Hamburguesa')).toBeInTheDocument()
  expect(screen.getByText('Nota: Sin cebolla')).toBeInTheDocument()
  expect(screen.getByText('x2')).toBeInTheDocument()
  expect(screen.getAllByText(/54\.000/)).toHaveLength(2)
  expect(screen.getByText('3001234567')).toBeInTheDocument()
})

// Falla si una reserva sin pre-pedido, sin notas y sin teléfono pinta líneas o datos vacíos en vez de decir que no
// trae pre-pedido.
it('sin pre-pedido lo dice y no muestra notas ni teléfono vacíos', async () => {
  render(wrap(<ReservationDetailModal open onClose={jest.fn()} reservationId={7} load={async () => detail({ lines: [], notes: '', phone: '', babyChair: false, amountTotal: 0 })} />))
  expect(await screen.findByText('Esta reserva no trae pre-pedido.')).toBeInTheDocument()
  expect(screen.queryByText('Notas:')).not.toBeInTheDocument()
  expect(screen.getByText('No')).toBeInTheDocument()
})

// Falla si al cambiar de reserva el modal muestra la anterior mientras carga la nueva, o si una respuesta tardía de la
// anterior la pisa.
it('no muestra la reserva anterior mientras carga otra', async () => {
  let resolveOld: (d: ReservationDetail) => void = () => undefined
  const load = jest.fn((id: number) => (id === 7 ? new Promise<ReservationDetail>((r) => { resolveOld = r }) : Promise.resolve(detail({ id: 8, name: 'RV008' }))))
  const view = render(wrap(<ReservationDetailModal open onClose={jest.fn()} reservationId={7} load={load} />))
  view.rerender(wrap(<ReservationDetailModal open onClose={jest.fn()} reservationId={8} load={load} />))
  expect(await screen.findByText('RV008')).toBeInTheDocument()
  await act(async () => { resolveOld(detail()) })
  expect(screen.queryByText('RV007')).not.toBeInTheDocument()
})

// Falla si el modal cerrado pide la reserva al servidor.
it('cerrado no carga nada', () => {
  const load = jest.fn(async () => detail())
  render(wrap(<ReservationDetailModal open={false} onClose={jest.fn()} reservationId={7} load={load} />))
  expect(load).not.toHaveBeenCalled()
})
