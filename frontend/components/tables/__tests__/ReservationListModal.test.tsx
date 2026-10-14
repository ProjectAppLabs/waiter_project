import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { ReservationListModal } from '@/components/tables/ReservationListModal'
import { messages } from '@/lib/i18n/messages'
import type { TableReservation } from '@/lib/services/tables'

const booking = (id: number, customerName: string, date: string, timeLabel: string): TableReservation =>
  ({ id, name: `Rv00${id}`, customerName, people: 2, babyChair: false, state: 'confirmed', date, timeStart: 10, timeEnd: 11, label: '10:00', timeLabel, tableId: 7 })
const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Falla si la lista de reservas de la mesa deja de mostrar cliente, fecha y franja de waiter.reservation, o si
// "Detalle" no abre la reserva elegida (los datos son reales: nunca filas de ejemplo).
it('lists the reservations of the table and opens the one asked for', async () => {
  const onDetail = jest.fn()
  const load = jest.fn(async () => [booking(1, 'Eva', '2026-03-04', '10:00 – 11:00'), booking(2, 'Alexander', '2026-03-04', '14:00 – 15:00')])
  wrap(<ReservationListModal open onClose={() => undefined} tableId={7} tableName="11" onDetail={onDetail} load={load} />)
  expect(await screen.findByText('Eva')).toBeInTheDocument()
  expect(screen.getByText('10:00 – 11:00')).toBeInTheDocument()
  expect(screen.getAllByText('mié, 4 de mar')).toHaveLength(2)
  await userEvent.click(screen.getAllByRole('button', { name: 'Detalle' })[1])
  expect(onDetail).toHaveBeenCalledWith(expect.objectContaining({ customerName: 'Alexander' }))
})

// Falla si una mesa sin reservas inventa filas en vez de mostrar el estado vacío del kit.
it('shows the empty state when the table has no reservations', async () => {
  wrap(<ReservationListModal open onClose={() => undefined} tableId={7} tableName="11" onDetail={() => undefined} load={async () => []} />)
  expect(await screen.findByText('Sin reservas')).toBeInTheDocument()
  expect(screen.getByText('La mesa 11 no tiene reservas confirmadas.')).toBeInTheDocument()
})
