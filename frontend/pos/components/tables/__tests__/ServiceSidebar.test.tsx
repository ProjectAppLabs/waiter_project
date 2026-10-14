import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { ServiceSidebar } from '@/components/tables/ServiceSidebar'
import { messages } from '@/lib/i18n/messages'
import type { KitOrder } from '@/lib/domain/orderState'
import type { Table } from '@/lib/types'

const table = (id: number): Table => ({ id, number: 8, floorId: id, seats: 4, x: 0, y: 0, width: 120, height: 120, shape: 'square', color: null })
const order = (id: number, ready: boolean): KitOrder => ({
  id, tableId: id, tableNumber: 8, number: `DI00${id}`, type: 'dine_in', state: 'draft', customer: '', startedAt: '2026-09-21 12:00:00', total: 100, tax: 0,
  courses: ready ? [{ id, fired: true, readyAt: '2026-09-21 12:05:00', servedAt: null }] : [],
  lines: [{ id: id * 10, uuid: `line-${id}`, productId: id, name: `Plato ${id}`, qty: 1, unitPrice: 100, subtotal: 100, total: 100, note: '', courseId: ready ? id : null, readyAt: null, servedAt: null }],
})
function setup() {
  const onOpenTable = jest.fn()
  render(<NextIntlClientProvider locale="es" messages={messages}>
    <ServiceSidebar orders={[{ ...order(1, true), lines: [...order(1, true).lines, { ...order(1, true).lines[0], id: 11, name: 'Jugo' }] }, { ...order(3, false), tableId: 1 }, order(2, false)]} calls={[{ tableId: 1, kind: 'assist', since: '2026-09-21 12:00:00' }, { tableId: 2, kind: 'assist', since: '2026-09-21 12:00:00' }]}
      tables={[table(1), table(2)]} visibleTableIds={[1]} locations={new Map([
        [1, { floor: 'Piso 1', zone: 'Ventana', zoneStatus: 'ready' }],
        [2, { floor: 'Terraza', zone: 'Bar', zoneStatus: 'ready' }],
      ])} loaded onOpenTable={onOpenTable} />
  </NextIntlClientProvider>)
  return { onOpenTable }
}


// Falla si los pendientes de una mesa se parten en varias tarjetas, se entrega desde la barra o no abre la mesa.
it('groups all ready dishes, pending rounds and a call into a single table card', async () => {
  const { onOpenTable } = setup()
  expect(screen.getAllByRole('listitem')).toHaveLength(1)
  const card = screen.getByRole('listitem')
  expect(card).toHaveTextContent('Plato 1')
  expect(card).toHaveTextContent('Jugo')
  expect(card).toHaveTextContent('+1 ítems más')
  expect(card).toHaveTextContent('Sin enviar a cocina')
  expect(card).toHaveTextContent('Solicita un mesero')
  expect(screen.queryByRole('button', { name: 'Marcar entregado' })).not.toBeInTheDocument()
  await userEvent.click(within(card).getByRole('button'))
  expect(onOpenTable).toHaveBeenCalledWith(1)
})

// Falla si mesas con el mismo número en pisos distintos se mezclan o si el filtro por tipo de pendiente no filtra.
it('keeps repeated table numbers on different floors separate and filters by pending type', async () => {
  setup()
  await userEvent.selectOptions(screen.getByRole('combobox'), 'all')
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByText('Terraza · Bar')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Listos para entregar: 1' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(1)
  expect(screen.queryByText('Terraza · Bar')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Listos para entregar: 1' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
})
