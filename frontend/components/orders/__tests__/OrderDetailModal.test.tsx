import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { OrderDetailModal } from '@/components/orders/OrderDetailModal'
import { SortMenu } from '@/components/orders/SortMenu'
import { messages } from '@/lib/i18n/messages'
import type { KitLine, KitOrder } from '@/lib/domain/orderState'

const line = (id: number, name: string, courseId: number | null, note = ''): KitLine => ({ id, uuid: `u${id}`, productId: 3, name, qty: 1, unitPrice: 36900, subtotal: 36900, total: 43911, note, courseId, readyAt: null, servedAt: null })
const order: KitOrder = {
  id: 7, number: 'DI007', type: 'dine_in', state: 'draft', tableId: 4, tableNumber: 3, customer: 'Eva', startedAt: '2026-09-06 20:00:00', total: 131733, tax: 21033,
  lines: [line(1, 'Hamburguesa Angus', 1), line(2, 'Papas Trufadas', null, 'sin sal'), line(3, 'Limonada de Coco', 2)],
  courses: [{ id: 1, fired: true, preparationAt: 'x', readyAt: null, servedAt: null }, { id: 2, fired: true, readyAt: 'x', servedAt: 'x' }],
}
const ui = (node: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}>{node}</NextIntlClientProvider>)

// Falla si las líneas no se agrupan por estado de cocina, si "Cancelar" aparece fuera de "Esperando cocina" o si la nota se pierde.
it('groups lines by kitchen state with cancel only on the waiting group', async () => {
  const onCancel = jest.fn()
  ui(<OrderDetailModal order={order} status="in_progress" percent={50} onClose={() => undefined} imageOf={() => null} onCancelWaiting={onCancel} />)
  expect(within(screen.getByRole('region', { name: 'Esperando cocina' })).getByText('Papas Trufadas')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'En progreso' })).getByText('Hamburguesa Angus')).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: 'Servido' })).getByText('Limonada de Coco')).toBeInTheDocument()
  expect(screen.getByText('Nota: sin sal')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(onCancel).toHaveBeenCalledWith([order.lines[1]])
})

// Falla si "+ Nuevo pedido" no lleva a agregar ronda o si "Ir a pagar" se habilita con líneas sin servir.
it('links to add a round and keeps proceed to payment disabled while unserved', () => {
  ui(<OrderDetailModal order={order} status="in_progress" percent={50} onClose={() => undefined} imageOf={() => null} onCancelWaiting={() => undefined} />)
  expect(screen.getByRole('link', { name: 'Nuevo pedido' })).toHaveAttribute('href', '/pedidos/7/agregar')
  expect(screen.queryByRole('link', { name: 'Ir a pagar' })).toBeNull()
  expect(screen.getByText('Ir a pagar')).toHaveAttribute('aria-disabled', 'true')
  expect(screen.getByText('$ 131.733')).toBeInTheDocument()
})

// Falla si el menú de orden no marca la opción activa o no avisa el cambio.
it('sort menu opens, marks the active option and reports the change', async () => {
  const onChange = jest.fn()
  ui(<SortMenu value="latest" onChange={onChange} />)
  await userEvent.click(screen.getByRole('button', { name: 'Ordenar por: Más reciente' }))
  expect(screen.getByRole('menuitemradio', { name: 'Más reciente' })).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(screen.getByRole('menuitemradio', { name: 'Tipo de pedido' }))
  expect(onChange).toHaveBeenCalledWith('type')
})
