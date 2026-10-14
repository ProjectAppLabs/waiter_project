import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ShiftTable } from '@/components/ops/ShiftTable'
import messages from '@/lib/i18n/messages/es.json'
import type { ShiftOrder } from '@/lib/services/ops'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const NOW = Date.parse('2026-09-05T02:20:00Z')
const base: ShiftOrder = { id: 127, reference: '#127', tableId: 7, tableNumber: 7, waiter: 'Sofía', origin: 'waiter', total: 91200, state: 'draft', kitchen: 'cooking', firedAt: '2026-09-05 02:00:00', startedAt: '2026-09-05 01:50:00' }

// Falla si la fila pierde el origen "Autónomo" en Brasa o el chip "Demorado N min".
it('renders a late waiter order and an autonomous diner order', () => {
  wrap(<ShiftTable orders={[base, { ...base, id: 126, origin: 'diner', kitchen: 'none', firedAt: null }]} now={NOW} lateMinutes={18} emptyText="Nada" />)
  expect(screen.getByText('Demorado 20 min')).toBeInTheDocument()
  expect(screen.getByText('Autónomo')).toHaveClass('text-brand-600')
  expect(screen.getByText('Pendiente')).toBeInTheDocument()
  expect(screen.getAllByText('91.200')[0]).toHaveClass('font-mono')
})
