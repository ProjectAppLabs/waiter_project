import { render, screen } from '@testing-library/react'

import { ConsumptionView } from '@/components/business/ConsumptionView'
import { consumption } from '@/lib/services/core/business'

jest.mock('@/lib/services/core/business', () => ({ consumption: jest.fn() }))

// Falla si el dueño no ve cuántos locales se le cobran y a qué precio, lo que se cobra por uso, el total estimado o el
// consumo medido por local.
it('muestra la cuenta estimada y el uso del mes', async () => {
  const period = new Date().toISOString().slice(0, 7)
  jest.mocked(consumption).mockResolvedValue({ period, currency: 'COP', locals_active: 2, price_per_local: 150000, estimated_total: 312000,
    lines: [{ concept: 'Mensualidad por local', module: 'nucleo', unit: 'local', quantity: 2, unit_price: 150000, total: 300000 },
      { concept: 'Asistente en el menú', module: 'asistente_menu', unit: 'mensaje_ia', quantity: 120, unit_price: 100, total: 12000 }],
    usage: [{ module: 'asistente_menu', module_name: 'Asistente en el menú', unit: 'mensaje_ia', unit_name: 'Mensajes', quantity: 120, restaurant_id: 7, restaurant_name: 'Poblado' }] })
  render(<ConsumptionView />)
  const bill = await screen.findByRole('table', { name: 'Cuenta estimada' })
  expect(bill.textContent?.replace(/\s/g, ' ')).toContain('Mensualidad por local2$ 150.000$ 300.000')
  expect(screen.getByText(/2 locales activos a/)).toBeInTheDocument()
  expect(screen.getByText('Total estimado').parentElement?.textContent?.replace(/\s/g, ' ')).toContain('$ 312.000')
  expect(screen.getByRole('table', { name: 'Uso del mes' })).toHaveTextContent('Asistente en el menúMensajesPoblado120')
})
