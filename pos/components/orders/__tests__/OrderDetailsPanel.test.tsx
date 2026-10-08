import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { OrderDetailsPanel } from '@/components/orders/OrderDetailsPanel'
import { cartTotals, newLine, type OptionChoice, type TaxRate } from '@/lib/domain/orderWizard'
import { messages } from '@/lib/i18n/messages'
import type { Product } from '@/lib/types'

const angus: Product = { id: 3, templateId: 3, name: 'Hamburguesa Angus', price: 36900, categoryIds: [1], taxIds: [55], favorite: false, storable: false, soldOut: false, hasImage: false }
const iva: TaxRate = { id: 55, name: 'IVA 19%', amount: 19, amountType: 'percent', priceInclude: false }
const bbq: OptionChoice = { id: 2, name: 'BBQ', priceExtra: 2000, kind: 'attribute', groupId: 1, productId: null, taxIds: [] }
const line = { ...newLine(angus, 2, 'sin cebolla', [bbq]), uuid: 'l1' }
const handlers = { onReset: jest.fn(), onQty: jest.fn(), onEdit: jest.fn(), onRemove: jest.fn(), onContinue: jest.fn() }

const show = () => render(
  <NextIntlClientProvider locale="es" messages={messages}>
    <OrderDetailsPanel lines={[line]} totals={cartTotals([line], [iva])} {...handlers} />
  </NextIntlClientProvider>,
)

// Falla si la línea pierde la nota o la adición, si el impuesto no se llama como en la carta (un INC no es IVA) o si
// el total suma de nuevo un impuesto que ya viene en el precio final del catálogo.
it('shows note, addition and the real tax total', () => {
  show()
  expect(screen.getByText('Nota: sin cebolla')).toBeInTheDocument()
  expect(screen.getByText('Adición: BBQ')).toBeInTheDocument()
  expect(screen.getByText('IVA 19%')).toBeInTheDocument()
  expect(screen.getByText('Total a pagar').nextSibling).toHaveTextContent('$ 77.800')
})

// Falla si borrar, editar o el stepper dejan de avisar al wizard.
it('wires remove, edit and the quantity stepper', async () => {
  show()
  await userEvent.click(screen.getByRole('button', { name: 'Quitar' }))
  await userEvent.click(screen.getByRole('button', { name: 'Editar' }))
  await userEvent.click(screen.getByRole('button', { name: 'Más' }))
  expect(handlers.onRemove).toHaveBeenCalledWith('l1')
  expect(handlers.onEdit).toHaveBeenCalledWith('l1')
  expect(handlers.onQty).toHaveBeenCalledWith('l1', 3)
})
