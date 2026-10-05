import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { OrderCard } from '@/components/orders/OrderCard'
import { messages } from '@/lib/i18n/messages'
import type { KitLine, KitOrder } from '@/lib/domain/orderState'

const line = (id: number, name: string, courseId: number | null): KitLine => ({ id, uuid: `u${id}`, productId: 3, name, qty: 2, unitPrice: 36900, subtotal: 73800, total: 87822, note: '', courseId, readyAt: null, servedAt: null })
const order: KitOrder = {
  id: 7, number: 'DI007', type: 'dine_in', state: 'draft', tableId: 4, tableNumber: 3, customer: 'Eva', startedAt: '2026-09-06 20:00:00', total: 87822, tax: 14022,
  lines: [line(1, 'Hamburguesa Angus', 1), line(2, 'Papas Trufadas', null)], courses: [{ id: 1, fired: true, readyAt: null, servedAt: null }],
}
const ui = (node: React.ReactNode) => render(<NextIntlClientProvider locale="es" messages={messages}>{node}</NextIntlClientProvider>)

// Falla si un pedido de mesa no muestra piso y zona o si uno para llevar muestra una zona que no tiene.
it('shows the floor and zone for table orders, but not for takeout', () => {
  const location = { floor: 'Terraza', zone: 'Ventanas', zoneStatus: 'ready' as const }
  const { unmount } = ui(<OrderCard order={order} location={location} status="in_progress" percent={0} />)
  expect(screen.getByText('Piso')).toBeInTheDocument()
  expect(screen.getByText('Terraza')).toBeInTheDocument()
  expect(screen.getByText('Zona')).toBeInTheDocument()
  expect(screen.getByText('Ventanas')).toBeInTheDocument()
  unmount()
  ui(<OrderCard order={{ ...order, tableId: null, tableNumber: null, type: 'takeout' }} location={location} status="in_progress" percent={0} />)
  expect(screen.queryByText('Ventanas')).not.toBeInTheDocument()
})

// Falla si la tarjeta pierde el número DI, el tipo, la mesa, el % o el conteo de ítems del kit.
it('renders number, type, table chip, progress and items like the kit card', () => {
  ui(<OrderCard order={order} status="in_progress" percent={50} />)
  expect(screen.getByRole('article', { name: 'Pedido# DI007' })).toHaveTextContent('DI007')
  expect(screen.getByText('En mesa')).toBeInTheDocument()
  expect(screen.getByLabelText('Mesa 3')).toHaveTextContent('3')
  expect(screen.getByRole('img', { name: '50 %' })).toBeInTheDocument()
  expect(screen.getByText('4 ítems')).toBeInTheDocument()
  expect(screen.getByText('$ 87.822', { selector: 'span.font-semibold' })).toBeInTheDocument()
})

// Falla si el mesero puede entregar un plato que sigue en el fuego, o si "Cobrar" se habilita con algo sin entregar.
it('only lets the waiter tick a dish the kitchen already put on the pass', async () => {
  const onToggle = jest.fn()
  ui(<OrderCard order={order} status="in_progress" percent={0} onToggleLine={onToggle} />)
  // Sin enviar a cocina y en cocina: las dos casillas bloqueadas.
  expect(screen.getByRole('checkbox', { name: 'Marcar Papas Trufadas como servido' })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: 'Marcar Hamburguesa Angus como servido' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cobrar' })).toBeDisabled()

  // Cocina lo saca al pase y entonces sí.
  const ready = { ...order, lines: [{ ...order.lines[0], readyAt: '2026-09-06 20:10:00' }, order.lines[1]] }
  ui(<OrderCard order={ready} status="ready" percent={0} onToggleLine={onToggle} />)
  await userEvent.click(screen.getAllByRole('checkbox', { name: 'Marcar Hamburguesa Angus como servido' })[1])
  expect(onToggle).toHaveBeenCalledWith(ready.lines[0])
})

// Falla si un pedido totalmente servido no ofrece "Cobrar" como enlace a la pantalla de pago.
it('links to the payment screen when every line is served', () => {
  const served: KitOrder = { ...order, lines: [line(1, 'Hamburguesa Angus', 1)], courses: [{ id: 1, fired: true, readyAt: 'x', servedAt: 'x' }] }
  ui(<OrderCard order={served} status="served" percent={100} />)
  expect(screen.getByRole('link', { name: 'Cobrar' })).toHaveAttribute('href', '/pago/7')
  // La franja lo dice una vez; la línea no repite la palabra, su casilla marcada ya lo cuenta.
  expect(screen.getByText('Servido')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: /Hamburguesa Angus/ })).toBeChecked()
})
