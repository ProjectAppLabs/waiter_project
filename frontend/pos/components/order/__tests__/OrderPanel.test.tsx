import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { OrderPanel } from '@/components/order/OrderPanel'
import messages from '@/lib/i18n/messages/es.json'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const lines = [
  { uuid: 'a', productId: 3, name: 'Hamburguesa Angus', unitPrice: 36900, qty: 2, note: 'sin cebolla', taxIds: [] },
  { uuid: 'b', productId: 5, name: 'Limonada de coco', unitPrice: 9900, qty: 2, note: '', taxIds: [] },
]
const noop = jest.fn()

// Falla si el total parcial deja de sumar las líneas (el mesero anuncia un monto falso).
it('shows the partial total of all lines and the item count', () => {
  wrap(<OrderPanel tableNumber={8} lines={lines} selectedUuid={null} busy={false} onSelectLine={noop} onQty={noop} onNote={noop} onRemove={noop} onSave={noop} onBill={noop} onSend={noop} />)
  expect(screen.getByText('$ 93.600')).toHaveClass('font-mono')
  expect(screen.getByText('2 ítems')).toBeInTheDocument()
})

// Falla si la nota de cocina ("sin cebolla") no se ve en la línea: la cocina la prepara mal.
it('renders the line note as a chip', () => {
  wrap(<OrderPanel tableNumber={8} lines={lines} selectedUuid={null} busy={false} onSelectLine={noop} onQty={noop} onNote={noop} onRemove={noop} onSave={noop} onBill={noop} onSend={noop} />)
  expect(screen.getByText('sin cebolla')).toBeInTheDocument()
})

// Falla si "Enviar a cocina" queda habilitado con el pedido vacío (comandas en blanco).
it('disables send when there are no lines', () => {
  wrap(<OrderPanel tableNumber={8} lines={[]} selectedUuid={null} busy={false} onSelectLine={noop} onQty={noop} onNote={noop} onRemove={noop} onSave={noop} onBill={noop} onSend={noop} />)
  expect(screen.getByRole('button', { name: 'Enviar a cocina' })).toBeDisabled()
})
