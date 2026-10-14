import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ReadyList } from '@/components/kds/ReadyList'
import { messages } from '@/lib/i18n/messages'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const NOW = Date.parse('2026-09-05T02:10:40Z')
const line = (id: number, name: string, readyAt: string | null, servedAt: string | null = null) =>
  ({ id, name, qty: 1, note: '', station: null, readyAt, servedAt })
const ticket = { id: 8, orderId: 9, tableId: 2, tracking: '125', waiter: 'Julián', note: '', firedAt: '2026-09-05 02:00:00', readyAt: null,
  lines: [line(1, 'Costillas BBQ', '2026-09-05 02:10:00'), line(2, 'Risotto', null)] }

// Falla si el pase muestra lo que sigue en el fuego, o si el cronómetro cuenta desde el envío a cocina
// en vez de desde que el plato salió: es el tiempo que lleva enfriándose esperando al mesero.
it('lists only the dishes waiting on the pass, with the time since they came out', () => {
  wrap(<ReadyList tickets={[ticket]} tableNumberOf={() => 2} now={NOW} />)
  const rows = screen.getAllByRole('listitem')
  expect(rows).toHaveLength(1)
  expect(rows[0]).toHaveTextContent('Costillas BBQ')
  expect(rows[0]).toHaveTextContent('0:40')
  expect(screen.queryByText('Risotto')).not.toBeInTheDocument()
})

// Falla si la cocina puede marcar entregado: eso lo hace el mesero al dejar el plato en la mesa.
it('offers no delivery action: the pass is a queue, not a remote control', () => {
  wrap(<ReadyList tickets={[ticket]} tableNumberOf={() => 2} now={NOW} />)
  expect(screen.queryAllByRole('button')).toHaveLength(0)
  expect(screen.getByText('Esperando al mesero')).toBeInTheDocument()
})

// Falla si un plato ya entregado sigue ocupando sitio en el pase.
it('drops a dish once the waiter took it to the table', () => {
  const taken = { ...ticket, lines: [line(1, 'Costillas BBQ', '2026-09-05 02:10:00', '2026-09-05 02:10:30'), ticket.lines[1]] }
  wrap(<ReadyList tickets={[taken]} tableNumberOf={() => 2} now={NOW} />)
  expect(screen.queryAllByRole('listitem')).toHaveLength(0)
  expect(screen.getByText('Nada listo todavía')).toBeInTheDocument()
})
