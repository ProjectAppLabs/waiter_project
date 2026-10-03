import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { RefundModal } from '@/components/history/RefundModal'
import { messages } from '@/lib/i18n/messages'
import { createRefund, refundable } from '@/lib/services/core/refunds'

jest.mock('@/lib/services/core/refunds', () => ({ refundable: jest.fn(), createRefund: jest.fn() }))

const data = {
  lines: [
    { line_id: 1, name: 'Hamburguesa', qty: 2, refundable_qty: 2, unit_amount: 19450, refundable_amount: 38900 },
    { line_id: 2, name: 'Limonada', qty: 1, refundable_qty: 0, unit_amount: 9900, refundable_amount: 0 },
  ],
  tip: 3000, credit_note: true, refunds: [{ id: 1, order_id: 9, amount: 9900, tip: 0, reason: 'mal servida', restock: false, created_at: '' }],
  methods: [{ method_id: 2, name: 'Tarjeta', type: 'bank', paid: 30000, refundable: 30000 }, { method_id: 1, name: 'Efectivo', type: 'cash', paid: 20000, refundable: 20000 }],
}
const wrap = (onDone = jest.fn()) => render(<NextIntlClientProvider locale="es" messages={messages}><RefundModal orderId={9} number="DI-004" onClose={jest.fn()} onDone={onDone} /></NextIntlClientProvider>)

beforeEach(() => { jest.mocked(refundable).mockResolvedValue(data as never); jest.mocked(createRefund).mockReset() })

// Falla si se puede devolver sin motivo, más de lo que queda de un plato, o con un reparto que no suma lo devuelto; si
// el efectivo no va primero; o si el pedido no sale con las cantidades, la propina, los métodos, el motivo, el
// inventario y una clave que se mantiene al reintentar.
it('devolución parcial: valida, reparte primero en efectivo y envía lo elegido', async () => {
  const onDone = jest.fn()
  wrap(onDone)
  expect(await screen.findByText('Ya devuelto')).toBeInTheDocument()
  expect(screen.getByText('Este pedido ya tiene devoluciones por $ 9.900.')).toBeInTheDocument()
  expect(screen.getByText('El pedido tiene factura: se emitirá una nota crédito.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Uno más de Limonada' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Uno más de Hamburguesa' }))
  fireEvent.change(screen.getByLabelText('Propina a devolver'), { target: { value: '5000' } })
  expect(screen.getByLabelText('Propina a devolver')).toHaveValue('3.000')
  const confirm = screen.getByRole('button', { name: 'Devolver $ 22.450' })
  expect(confirm).toBeDisabled()
  expect(screen.getByLabelText('Efectivo')).toHaveValue('20.000')
  expect(screen.getByLabelText('Tarjeta')).toHaveValue('2.450')
  fireEvent.change(screen.getByLabelText('Motivo de la devolución'), { target: { value: 'El cliente no la recibió' } })
  fireEvent.click(screen.getByRole('switch'))
  fireEvent.change(screen.getByLabelText('Tarjeta'), { target: { value: '1000' } })
  expect(screen.getByText('El reparto debe sumar $ 22.450.')).toBeInTheDocument()
  expect(confirm).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Tarjeta'), { target: { value: '2450' } })
  jest.mocked(createRefund).mockRejectedValueOnce(new Error('Se cayó')).mockResolvedValueOnce({ refund: { amount: 22450 }, order: {}, credit_note: { number: 'NC-1' } } as never)
  fireEvent.click(confirm)
  expect(await screen.findByRole('alert')).toHaveTextContent('Se cayó')
  fireEvent.click(confirm)
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  const [first, second] = jest.mocked(createRefund).mock.calls
  expect(first[1]).toEqual({ lines: [{ line_id: 1, qty: 1 }], tip: 3000, payments: [{ method_id: 1, amount: 20000 }, { method_id: 2, amount: 2450 }], reason: 'El cliente no la recibió', restock: true, request_key: expect.stringMatching(/^refund-/) })
  expect(second[1].request_key).toBe(first[1].request_key)
})

// Falla si «Devolver todo» deja platos o propina sin devolver, o si incluye lo que ya se devolvió.
it('devolver todo elige lo que queda', async () => {
  wrap()
  fireEvent.click(await screen.findByRole('button', { name: 'Devolver todo' }))
  expect(screen.getByRole('button', { name: 'Devolver $ 41.900' })).toBeInTheDocument()
})
