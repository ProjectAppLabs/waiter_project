import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { AddDishModal } from '@/components/orders/AddDishModal'
import { messages } from '@/lib/i18n/messages'
import type { OptionGroup } from '@/lib/domain/orderWizard'
import type { Product } from '@/lib/types'

const angus: Product = { id: 3, templateId: 3, name: 'Hamburguesa Angus', price: 36900, categoryIds: [1], taxIds: [55], favorite: false, storable: false, soldOut: false, hasImage: false }
const groups: OptionGroup[] = [
  { id: 1, name: 'Salsa', kind: 'attribute', required: true, multiple: false, choices: [{ id: 2, name: 'BBQ', priceExtra: 2000, kind: 'attribute', groupId: 1, productId: null, taxIds: [] }] },
  { id: 4, name: 'Adiciones', kind: 'combo', required: false, multiple: true, choices: [{ id: 9, name: 'Tocineta', priceExtra: 6900, kind: 'combo', groupId: 4, productId: 18, taxIds: [] }] },
]
const show = (onConfirm = jest.fn()) => {
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <AddDishModal product={angus} description="Con papas" groups={groups} onClose={jest.fn()} onConfirm={onConfirm} />
    </NextIntlClientProvider>,
  )
  return onConfirm
}

// Falla si "Agregar al carrito" se habilita sin elegir el grupo obligatorio o si la adición no viaja en la línea.
it('blocks the cart until the required group is chosen and carries the add-on', async () => {
  const onConfirm = show()
  const add = screen.getByRole('button', { name: 'Agregar al carrito' })
  expect(add).toBeDisabled()
  await userEvent.click(screen.getByRole('radio', { name: /BBQ/ }))
  await userEvent.click(screen.getByRole('checkbox', { name: /Tocineta/ }))
  expect(add).toBeEnabled()
  await userEvent.click(add)
  expect(onConfirm).toHaveBeenCalledWith({ qty: 1, note: '', options: [expect.objectContaining({ name: 'BBQ' }), expect.objectContaining({ name: 'Tocineta' })] })
})

// Falla si la nota de cocina o la cantidad no llegan a la línea del carrito.
it('sends the kitchen note and the quantity from the stepper', async () => {
  const onConfirm = show()
  await userEvent.click(screen.getByRole('radio', { name: /BBQ/ }))
  await userEvent.type(screen.getByLabelText('Nota para cocina'), 'sin cebolla')
  await userEvent.click(screen.getByRole('button', { name: 'Más' }))
  await userEvent.click(screen.getByRole('button', { name: 'Agregar al carrito' }))
  expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ qty: 2, note: 'sin cebolla' }))
})
