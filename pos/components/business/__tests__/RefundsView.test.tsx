import { render, screen, within } from '@testing-library/react'

import { RefundsView } from '@/components/business/RefundsView'
import { listRefunds } from '@/lib/services/core/refunds'

jest.mock('@/lib/services/core/refunds', () => ({ listRefunds: jest.fn() }))

const refund = {
  id: 1, order_id: 9, order_number: 'DI-004', restaurant_id: 2, restaurant_name: 'Poblado', shift_id: 3, total: 22450, tip: 3000, reason: 'El cliente no la recibió',
  restock: true, request_key: 'k', created_at: '2026-10-03T15:00:00Z', account: { id: 4, name: 'Laura Encargada' }, lines: [],
  payments: [{ method_id: 1, amount: 20000, name: 'Efectivo', type: 'cash' }, { method_id: 2, amount: 2450, name: 'Tarjeta', type: 'bank' }],
}

// Falla si el dueño no ve de qué pedido y restaurante es cada devolución, quién la hizo, por dónde salió el dinero y
// el motivo, o si el total del periodo no suma lo devuelto.
it('lista las devoluciones con pedido, persona, métodos y motivo', async () => {
  jest.mocked(listRefunds).mockResolvedValue([refund] as never)
  render(<RefundsView restaurants={[{ id: 2, name: 'Poblado' }, { id: 5, name: 'Laureles' }]} />)
  const row = within(await screen.findByRole('table', { name: 'Devoluciones' })).getAllByRole('row')[1]
  const text = (row.textContent ?? '').replace(/\s/g, ' ')
  for (const part of ['Poblado', 'DI-004', 'Laura Encargada', '$ 22.450', 'Efectivo $ 20.000 · Tarjeta $ 2.450', 'El cliente no la recibió', 'Volvió al inventario']) expect(text).toContain(part)
  expect((document.querySelector('section p')?.textContent ?? '').replace(/\s/g, ' ')).toContain('Total del periodo: $ 22.450.')
  expect(jest.mocked(listRefunds).mock.calls[0][0]).not.toHaveProperty('restaurant_id')
})
