import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { ChannelCode } from '@/components/templates/patterns/ChannelCode'
import type { CodeProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'

const props = (over: Partial<CodeProps> = {}): CodeProps => ({ template: DEFAULT_TEMPLATE, email: 'camila@correo.com', onVerify: jest.fn(), onResend: jest.fn(), onOtherChannel: jest.fn(), onBack: jest.fn(), busy: false, error: null, ...over })
const wrap = (p: CodeProps) => render(<NextIntlClientProvider locale="es" messages={messages}><ChannelCode {...p} /></NextIntlClientProvider>)
const confirm = () => screen.getByRole('button', { name: 'Confirmar código' })
const digit = (n: number) => screen.getByRole('textbox', { name: `Dígito ${n} de 6` })

afterEach(() => { jest.useRealTimers() })

// Falla si el correo no es el canal elegido por defecto (con el email), si elegir SMS no avisa al motor (onOtherChannel), si el botón se
// habilita antes del sexto dígito, o si el código verificado no es el de las casillas.
it('offers the two channels, tells the engine when SMS is chosen and verifies six digits', async () => {
  const user = userEvent.setup()
  const p = props()
  wrap(p)
  expect(screen.getByRole('heading', { name: 'Entrar sin contraseña' })).toBeInTheDocument()
  const email = screen.getByRole('radio', { name: /Correo/ })
  expect(email).toHaveAttribute('aria-checked', 'true')
  expect(email).toHaveTextContent('camila@correo.com')
  await user.click(screen.getByRole('radio', { name: /SMS/ }))
  expect(p.onOtherChannel).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status')).toHaveTextContent('En la demo el código llega por el mismo canal.')
  expect(confirm()).toBeDisabled()
  digit(1).focus()
  await user.keyboard('12345')
  expect(confirm()).toBeDisabled()
  await user.keyboard('6')
  expect(confirm()).toBeEnabled()
  await user.click(confirm())
  expect(p.onVerify).toHaveBeenCalledWith('123456')
})

// Falla si pegar el código entero no rellena las seis casillas, si se puede reenviar antes de la cuenta atrás, o si ← no vuelve.
it('spreads a pasted code, counts down before resending and goes back', () => {
  jest.useFakeTimers()
  const p = props()
  wrap(p)
  fireEvent.change(digit(1), { target: { value: '987654' } })
  expect([1, 2, 3, 4, 5, 6].map((n) => (digit(n) as HTMLInputElement).value).join('')).toBe('987654')
  expect(screen.getByRole('button', { name: 'Reenviar en 0:38' })).toBeDisabled()
  act(() => { jest.advanceTimersByTime(38_000) })
  fireEvent.click(screen.getByRole('button', { name: 'Reenviar el código' }))
  expect(p.onResend).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
  expect(p.onBack).toHaveBeenCalledTimes(1)
})
