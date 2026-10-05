import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { ChangeTableModal } from '@/components/tables/ChangeTableModal'
import { messages } from '@/lib/i18n/messages'
import type { OrderDetail } from '@/lib/services/tables'

const detail = (over: Partial<OrderDetail> = {}): OrderDetail => ({
  id: 41, tracking: '0007', reference: 'P-41', serviceAt: 'table', customerName: 'Laura', dateOrder: '2026-10-04 18:30:00',
  total: 50000, sent: 2, served: 1, lines: [], ...over,
})
function mount(over: Partial<OrderDetail> = {}, busy = false) {
  const onClose = jest.fn(), onConfirm = jest.fn()
  render(<NextIntlClientProvider locale="es" messages={messages}>
    <ChangeTableModal open onClose={onClose} detail={detail(over)} current="M4" target="M9" busy={busy} onConfirm={onConfirm} />
  </NextIntlClientProvider>)
  return { onClose, onConfirm }
}

// Falla si el modal no dice qué pedido se mueve (código con prefijo y tipo), de qué cliente, ni de qué mesa a cuál,
// o si «Confirmar cambio» y «Cancelar» no llaman a quien corresponde.
it('muestra el pedido, el cliente y las dos mesas, y confirma o cancela', () => {
  const { onClose, onConfirm } = mount()
  const dialog = screen.getByRole('dialog', { name: 'Cambiar mesa' })
  expect(dialog).toHaveTextContent('DI0007')
  expect(dialog).toHaveTextContent('En mesa')
  expect(dialog).toHaveTextContent('Laura')
  expect(screen.getByText('Mesa actual').nextSibling).toHaveTextContent('M4')
  expect(screen.getByText('Mesa nueva').nextSibling).toHaveTextContent('M9')
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(onClose).toHaveBeenCalledTimes(1)
})

// Falla si un pedido para llevar sin número de seguimiento ni cliente muestra un código vacío o un nombre en blanco.
it('usa el id y «Sin nombre» cuando el pedido no tiene seguimiento ni cliente', () => {
  mount({ tracking: null, serviceAt: 'counter', customerName: '' })
  const dialog = screen.getByRole('dialog', { name: 'Cambiar mesa' })
  expect(dialog).toHaveTextContent('TA41')
  expect(dialog).toHaveTextContent('Para llevar')
  expect(dialog).toHaveTextContent('Sin nombre')
})

// Falla si mientras se mueve el pedido se puede volver a confirmar (pedido movido dos veces) o cancelar a medias.
it('bloquea los dos botones mientras el cambio está en curso', () => {
  const { onConfirm } = mount({}, true)
  expect(screen.getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar cambio' }))
  expect(onConfirm).not.toHaveBeenCalled()
})
