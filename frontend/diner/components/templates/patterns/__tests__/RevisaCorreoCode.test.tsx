import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { RevisaCorreoCode } from '@/components/templates/patterns/RevisaCorreoCode'
import type { CodeProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'

const props = (over: Partial<CodeProps> = {}): CodeProps => ({ template: DEFAULT_TEMPLATE, email: 'camila@correo.com', onVerify: jest.fn(), onResend: jest.fn(), onOtherChannel: jest.fn(), onBack: jest.fn(), busy: false, error: null, ...over })
const wrap = (p: CodeProps) => render(<NextIntlClientProvider locale="es" messages={messages}><RevisaCorreoCode {...p} /></NextIntlClientProvider>)
const confirm = () => screen.getByRole('button', { name: 'Confirmar código' })
const digit = (n: number) => screen.getByRole('textbox', { name: `Dígito ${n} de 6` })

afterEach(() => { jest.useRealTimers() })

// Falla si la cabecera pierde «Revisa tu correo» con el correo debajo, si el botón se habilita antes del sexto dígito, si las casillas
// aceptan letras, si el foco no avanza solo, o si el código verificado no es el de las seis casillas.
it('shows the mail header, enables the button only with six digits and verifies that code', async () => {
  const user = userEvent.setup()
  const p = props()
  wrap(p)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Revisa tu correo')
  expect(screen.getByText('camila@correo.com')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Usar mi celular' })).toBeNull()
  expect(confirm()).toBeDisabled()
  digit(1).focus()
  await user.keyboard('1a2345')
  expect(digit(5)).toHaveValue('5')
  expect(confirm()).toBeDisabled()
  await user.keyboard('6')
  expect(digit(6)).toHaveClass('border-t-acento')
  expect(confirm()).toBeEnabled()
  await user.click(confirm())
  expect(p.onVerify).toHaveBeenCalledWith('123456')
})

// Falla si pegar el código entero no rellena las seis casillas, si el contador no baja hasta habilitar «Reenviar», o si «Corregir mi correo»
// no vuelve al registro.
it('spreads a pasted code, counts down to resend and goes back to fix the email', () => {
  jest.useFakeTimers()
  const p = props({ error: 'Código incorrecto' })
  wrap(p)
  fireEvent.change(digit(1), { target: { value: '987654' } })
  expect(digit(6)).toHaveValue('4')
  expect(screen.getByRole('alert')).toHaveTextContent('Código incorrecto')
  expect(screen.getByText('Reenviar en 0:38')).toHaveClass('font-t-mono')
  act(() => { jest.advanceTimersByTime(38_000) })
  fireEvent.click(screen.getByRole('button', { name: 'Reenviar el código' }))
  expect(p.onResend).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('status')).toHaveTextContent('Listo, enviamos otro código.')
  fireEvent.click(screen.getByRole('button', { name: 'Corregir mi correo' }))
  expect(p.onBack).toHaveBeenCalledTimes(1)
})
