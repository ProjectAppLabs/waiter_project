import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { RegisterCard } from '@/components/cash/RegisterCard'
import { messages } from '@/lib/i18n/messages'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Falla si la tarjeta pierde el efectivo esperado, o si una salida de caja llega sin tipo, monto o motivo.
it('shows the expected cash and registers a cash-out from the keypad modal', async () => {
  const onMove = jest.fn().mockResolvedValue(undefined)
  wrap(<RegisterCard openSince="08:12" expectedCash={250000} onClose={jest.fn()} onMove={onMove} />)
  expect(screen.getByRole('region', { name: 'Caja' })).toHaveTextContent('$ 250.000')
  fireEvent.click(screen.getByRole('button', { name: 'Entrada / salida' }))
  fireEvent.click(screen.getByRole('button', { name: 'Salida' }))
  fireEvent.click(screen.getByRole('button', { name: '2' }))
  fireEvent.click(screen.getByRole('button', { name: '0' }))
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Hielo' } })
  fireEvent.click(screen.getByRole('button', { name: 'Registrar' }))
  await waitFor(() => expect(onMove).toHaveBeenCalledWith('out', 20, 'Hielo'))
  expect(await screen.findByRole('status')).toHaveTextContent('Movimiento registrado')
})
