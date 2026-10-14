import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { NumericKeypad } from '@/components/kit/NumericKeypad'
import { PinInput } from '@/components/kit/PinInput'
import messages from '@/lib/i18n/messages/es.json'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Falla si el teclado deja de emitir dígitos o si borrar deja de existir.
it('keypad emits digits and backspace', async () => {
  const onDigit = jest.fn(); const onBackspace = jest.fn()
  wrap(<NumericKeypad onDigit={onDigit} onBackspace={onBackspace} />)
  await userEvent.click(screen.getByRole('button', { name: '7' }))
  await userEvent.click(screen.getByRole('button', { name: 'Borrar' }))
  expect(onDigit).toHaveBeenCalledWith('7')
  expect(onBackspace).toHaveBeenCalled()
})

// Falla si el PIN muestra los dígitos en claro o si pierde una de las seis casillas.
it('pin input renders six masked boxes and exposes the value to assistive tech', () => {
  wrap(<PinInput value="123" label="PIN" />)
  expect(screen.getAllByTestId('pin-box')).toHaveLength(6)
  expect(screen.getAllByTestId('pin-box').filter((b) => b.dataset.filled === 'true')).toHaveLength(3)
  expect(screen.getByLabelText('PIN')).toHaveValue('123')
  expect(screen.queryByText('1')).toBeNull()
})
