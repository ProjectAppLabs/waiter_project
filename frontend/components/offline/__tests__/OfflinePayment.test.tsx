import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { OfflinePayment } from '@/components/offline/OfflinePayment'
import { messages } from '@/lib/i18n/messages'
import { useOutboxStore } from '@/lib/offline/outbox'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import type { Catalog } from '@/lib/types'

const wrap = (onPaid = jest.fn()) => render(<NextIntlClientProvider locale="es" messages={messages}>
  <OfflinePayment order={{ uuid: 'p-1' }} total={38900} label="Ana" onClose={jest.fn()} onPaid={onPaid} /></NextIntlClientProvider>)

beforeEach(() => {
  localStorage.clear()
  useOutboxStore.setState({ entries: [], failed: [], ids: {}, loaded: true })
  useCatalogStore.setState({ catalog: { paymentMethods: [{ id: 1, name: 'Efectivo', type: 'cash' }, { id: 2, name: 'Tarjeta', type: 'bank' }, { id: 3, name: 'Fiado', type: 'pay_later' }] } as unknown as Catalog })
})

// Falla si sin conexión se puede cobrar en efectivo con menos de lo que vale el pedido, si el cambio no se ve, o si el
// pago no queda en la cola por el saldo que diga el servidor seguido del cierre del pedido.
it('efectivo: exige cubrir el total, muestra el cambio y deja pago y cierre en la cola', () => {
  const onPaid = jest.fn()
  wrap(onPaid)
  const confirm = screen.getByRole('button', { name: 'Registrar pago' })
  fireEvent.change(screen.getByLabelText('Efectivo recibido'), { target: { value: '30000' } })
  expect(confirm).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Efectivo recibido'), { target: { value: '50.000' } })
  expect(screen.getByText('Cambio: $ 11.100')).toBeInTheDocument()
  fireEvent.click(confirm)
  expect(useOutboxStore.getState().entries).toMatchObject([
    { kind: 'payment', order: { uuid: 'p-1' }, methodId: 1, amount: 'balance', received: 50000, reference: '' },
    { kind: 'pay', order: { uuid: 'p-1' } },
  ])
  expect(onPaid).toHaveBeenCalled()
})

// Falla si el datáfono sin conexión se registra sin el número de aprobación, o si se ofrece un método que necesita red.
it('datáfono: pide la aprobación y no ofrece otros métodos', () => {
  wrap()
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Efectivo', 'Datáfono'])
  fireEvent.click(screen.getByRole('tab', { name: 'Datáfono' }))
  const confirm = screen.getByRole('button', { name: 'Registrar pago' })
  expect(confirm).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Número de aprobación del datáfono'), { target: { value: '483920' } })
  fireEvent.click(confirm)
  expect(useOutboxStore.getState().entries[0]).toMatchObject({ kind: 'payment', methodId: 2, received: null, reference: '483920' })
})
