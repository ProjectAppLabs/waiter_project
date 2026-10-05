import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { TicketCard } from '@/components/kds/TicketCard'
import { messages } from '@/lib/i18n/messages'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const NOW = Date.parse('2026-09-05T02:18:40Z')
const ticket = { id: 5, orderId: 9, tableId: 3, tracking: '127', waiter: 'Sofía', note: '', firedAt: '2026-09-05 02:00:00', preparationAt: '2026-09-05 02:01:00', readyAt: null,
  lines: [{ id: 1, name: 'Lomo a la parrilla', qty: 1, note: 'término medio', station: 'Parrilla', readyAt: null, servedAt: null }, { id: 2, name: 'Burrata italiana', qty: 2, note: '', station: 'Fríos', readyAt: null, servedAt: null }] }

// Falla si la tarjeta no se lee a dos metros: cantidad, plato, nota, cronómetro y la etiqueta de demora.
it('renders lines with quantity, note, the timer and the late tag', () => {
  wrap(<TicketCard ticket={ticket} tableNumber={7} now={NOW} onReady={jest.fn()} onReadyDish={jest.fn()} />)
  expect(screen.getByRole('heading', { name: 'Mesa 7' })).toBeInTheDocument()
  expect(screen.getByText('2×')).toBeInTheDocument()
  expect(screen.getByText(/término medio/)).toBeInTheDocument()
  expect(screen.getByText('18:40')).toHaveClass('font-mono')
  expect(screen.getByText('Demorado')).toBeInTheDocument()
})

// Falla si "Listo todo" no avisa con el id del curso (cocina sacaría la comanda equivocada).
it('calls onReady with the course id', () => {
  const onReady = jest.fn()
  wrap(<TicketCard ticket={ticket} tableNumber={7} now={NOW} onReady={onReady} onReadyDish={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Listo todo' }))
  expect(onReady).toHaveBeenCalledWith(5)
})

// Falla si cocina no puede sacar un plato solo: salen de uno en uno, no toda la comanda a la vez.
it('marks one dish ready and shows the ones already on the pass', () => {
  const onReadyDish = jest.fn()
  const half = { ...ticket, lines: [ticket.lines[0], { ...ticket.lines[1], readyAt: '2026-09-05 02:12:00' }] }
  wrap(<TicketCard ticket={half} tableNumber={7} now={NOW} onReady={jest.fn()} onReadyDish={onReadyDish} />)
  // El que ya salió no vuelve a ofrecerse y deja de contar entre los que faltan.
  expect(screen.getByText('1 plato')).toBeInTheDocument()
  const buttons = screen.getAllByRole('button', { name: 'Listo' })
  expect(buttons).toHaveLength(1)
  fireEvent.click(buttons[0])
  expect(onReadyDish).toHaveBeenCalledWith(1)
})

// Falla si cocina puede marcar listos platos de una comanda recibida sin iniciar su preparación.
it('requires preparation before marking received dishes ready', () => {
  const onStart = jest.fn()
  wrap(<TicketCard ticket={{ ...ticket, preparationAt: null }} tableNumber={7} now={NOW} onStart={onStart} onReady={jest.fn()} onReadyDish={jest.fn()} />)
  expect(screen.getByText('Recibida')).toBeInTheDocument()
  screen.getAllByRole('button', { name: 'Listo' }).forEach((b) => expect(b).toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar preparación' }))
  expect(onStart).toHaveBeenCalledWith(5)
})

// Falla si cocina no ve el tamaño o las adiciones del plato, si un pedido para llevar dice «Mesa 0», o si el botón de
// imprimir no manda la comanda con su número y lugar.
it('muestra opciones y el tipo de servicio, e imprime la comanda', () => {
  const { usePrintStore } = jest.requireActual('@/lib/stores/printStore') as typeof import('@/lib/stores/printStore')
  usePrintStore.setState({ sheets: null })
  const takeout = { ...ticket, service: 'takeout' as const, lines: [{ ...ticket.lines[0], options: ['Doble', 'Tocineta'] }] }
  wrap(<TicketCard ticket={takeout} tableNumber={0} now={NOW} onReady={jest.fn()} onReadyDish={jest.fn()} />)
  expect(screen.getByText('+ Doble · Tocineta')).toBeInTheDocument()
  expect(screen.getByText('Para llevar')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Mesa 0' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Imprimir comanda' }))
  expect(usePrintStore.getState().sheets?.[0]).toMatchObject({ number: '127', place: { kind: 'takeout' } })
})
