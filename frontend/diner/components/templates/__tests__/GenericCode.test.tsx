import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { GenericCode } from '@/components/templates/generic/GenericCode'
import type { CodeProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'

const props = (over: Partial<CodeProps> = {}): CodeProps => ({ template: DEFAULT_TEMPLATE, email: 'camila@correo.com', onVerify: jest.fn(), onResend: jest.fn(), onOtherChannel: jest.fn(), onBack: jest.fn(), busy: false, error: null, ...over })
const wrap = (p: CodeProps) => render(<NextIntlClientProvider locale="es" messages={messages}><GenericCode {...p} /></NextIntlClientProvider>)
const confirm = () => screen.getByRole('button', { name: 'Confirmar código' })
const digit = (n: number) => screen.getByRole('textbox', { name: `Dígito ${n} de 6` })

afterEach(() => { jest.useRealTimers() })

// Falla si «Confirmar código» se habilita antes del sexto dígito, si las casillas aceptan letras, si el foco no avanza solo,
// o si el código verificado no es el de las seis casillas.
it('enables the button only with six digits and verifies that code', async () => {
  const user = userEvent.setup()
  const p = props()
  wrap(p)
  expect(screen.getByText(/camila@correo.com/)).toBeInTheDocument()
  expect(confirm()).toBeDisabled()
  digit(1).focus()
  await user.keyboard('1a2345')
  expect(digit(5)).toHaveValue('5')
  expect(digit(6)).toHaveValue('')
  expect(confirm()).toBeDisabled()
  await user.keyboard('6')
  expect(confirm()).toBeEnabled()
  await user.click(confirm())
  expect(p.onVerify).toHaveBeenCalledWith('123456')
})

// Falla si pegar el código entero en la primera casilla no rellena las seis.
it('spreads a pasted code over the six boxes', () => {
  const p = props()
  wrap(p)
  fireEvent.change(digit(1), { target: { value: '987654' } })
  expect([1, 2, 3, 4, 5, 6].map((n) => (digit(n) as HTMLInputElement).value).join('')).toBe('987654')
  expect(confirm()).toBeEnabled()
})

// Falla si se puede reenviar antes de que venza la cuenta atrás, si al vencer no se puede, o si ← y «Usar mi celular» no llaman a lo suyo.
it('counts down before allowing a resend and exposes the other exits', () => {
  jest.useFakeTimers()
  const p = props()
  wrap(p)
  expect(screen.getByRole('button', { name: 'Reenviar en 0:38' })).toBeDisabled()
  act(() => { jest.advanceTimersByTime(38_000) })
  fireEvent.click(screen.getByRole('button', { name: 'Reenviar el código' }))
  expect(p.onResend).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: 'Reenviar en 0:38' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Usar mi celular' }))
  expect(p.onOtherChannel).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
  expect(p.onBack).toHaveBeenCalledTimes(1)
})
