import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { CloseRegisterModal } from '@/components/cash/CloseRegisterModal'
import { messages } from '@/lib/i18n/messages'
import { cashSettings } from '@/lib/services/business'

jest.mock('@/lib/services/business', () => ({ cashSettings: jest.fn().mockResolvedValue({ tolerance: 2000, currency: 'COP' }) }))

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const data = { ordersCount: 44, ordersTotal: 3531687, expectedCash: 3401687, openingCash: 0, cashPayments: 3401687, cashMoves: [], otherMethods: [{ id: 2, name: 'Tarjeta', amount: 130000, count: 3 }], draftOrders: 0, openingNotes: '' }

// Falla si se puede cerrar con cuentas abiertas, si la diferencia no se calcula, si una caja que no cuadra se cierra sin
// explicar por qué (plan Q), o si el cierre no llega con lo contado y la nota.
it('computes the difference, blocks with open bills and closes with the counted cash', async () => {
  const onConfirm = jest.fn().mockResolvedValue({ successful: true, message: '' })
  const { rerender } = wrap(<CloseRegisterModal data={{ ...data, draftOrders: 2 }} onClose={jest.fn()} onConfirm={onConfirm} />)
  expect(screen.getByRole('alert')).toHaveTextContent('Hay 2 cuentas abiertas')
  rerender(<NextIntlClientProvider locale="es" messages={messages}><CloseRegisterModal data={data} onClose={jest.fn()} onConfirm={onConfirm} /></NextIntlClientProvider>)
  fireEvent.change(screen.getByLabelText(/Efectivo contado/), { target: { value: '3391687' } })
  expect(screen.getByText('-10.000')).toHaveClass('text-danger-ink')
  expect(screen.getByLabelText('¿Por qué faltan $ 10.000?')).toBeRequired()
  expect(screen.getByText(/el dueño lo verá en los cuadres/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Cerrar caja' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('¿Por qué faltan $ 10.000?'), { target: { value: 'Se pagó un domicilio en efectivo' } })
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar caja' }))
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(3391687, 'Se pagó un domicilio en efectivo'))
  expect(await screen.findByRole('status')).toHaveTextContent('Caja cerrada')
})

// Falla si el teclado del kit no escribe en el efectivo contado o si el modal pierde el resumen por método.
it('types the counted cash with the kit keypad inside a dialog with the shift summary', () => {
  wrap(<CloseRegisterModal data={data} onClose={jest.fn()} onConfirm={jest.fn()} />)
  const dialog = screen.getByRole('dialog', { name: 'Cerrar caja' })
  expect(dialog).toHaveTextContent('44 pedidos · $ 3.531.687')
  expect(dialog).toHaveTextContent('Tarjeta · 3')
  fireEvent.click(screen.getByRole('button', { name: '5' }))
  fireEvent.click(screen.getByRole('button', { name: '0' }))
  expect(screen.getByLabelText(/Efectivo contado/)).toHaveValue('50')
  fireEvent.click(screen.getByRole('button', { name: 'Borrar' }))
  expect(screen.getByLabelText(/Efectivo contado/)).toHaveValue('5')
})

// Falla si la caja que cuadra exige nota, o si el color de la diferencia no usa la tolerancia que fija el dueño.
it('sin diferencia no pide nota y colorea con la tolerancia del dueño', async () => {
  const onConfirm = jest.fn().mockResolvedValue({ successful: true, message: '' })
  wrap(<CloseRegisterModal data={data} onClose={jest.fn()} onConfirm={onConfirm} />)
  await waitFor(() => expect(cashSettings).toHaveBeenCalled())
  fireEvent.change(screen.getByLabelText(/Efectivo contado/), { target: { value: '3401687' } })
  expect(screen.getByLabelText('Notas de cierre')).not.toBeRequired()
  expect(screen.getByRole('button', { name: 'Cerrar caja' })).toBeEnabled()
  // $ 1.500 de diferencia está dentro de los $ 2.000 de tolerancia del dueño (no dentro de los 500 fijos de antes).
  fireEvent.change(screen.getByLabelText(/Efectivo contado/), { target: { value: '3400187' } })
  await waitFor(() => expect(screen.getByText('-1.500')).not.toHaveClass('text-danger-ink'))
})
