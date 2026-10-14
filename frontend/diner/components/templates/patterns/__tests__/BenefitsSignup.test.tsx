import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { BenefitsSignup } from '@/components/templates/patterns/BenefitsSignup'
import type { SignupProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'

const props = (over: Partial<SignupProps> = {}): SignupProps => ({ template: DEFAULT_TEMPLATE, onSubmit: jest.fn(), onSkip: jest.fn(), busy: false, error: null, discountPct: 5, ...over })
const wrap = (p: SignupProps) => render(<NextIntlClientProvider locale="es" messages={messages}><BenefitsSignup {...p} /></NextIntlClientProvider>)
const submit = () => screen.getByRole('button', { name: 'Crear cuenta y aplicar 5%' })

// Falla si faltan las tres razones, si se puede crear la cuenta sin nombre, correo válido o política, si pide celular o contraseña,
// o si el formulario no entrega los cinco campos del contrato (celular vacío, novedades en falso).
it('lists the three benefits, asks only name, email and the policy, and submits the contract form', async () => {
  const user = userEvent.setup()
  const p = props()
  wrap(p)
  expect(screen.getByRole('heading', { name: 'Crear cuenta' })).toBeInTheDocument()
  expect(screen.getByText('Tres razones, ninguna de marketing')).toBeInTheDocument()
  expect(screen.getByText('5%')).toHaveClass('text-t-acento')
  expect(screen.getByText('de descuento hoy')).toBeInTheDocument()
  expect(screen.getByText('Tu tarjeta guardada, sin volver a escribirla')).toBeInTheDocument()
  expect(screen.getByText('Tus alergias van solas a la comanda')).toBeInTheDocument()
  expect(screen.queryByLabelText('Celular')).toBeNull()
  expect(submit()).toBeDisabled()
  await user.type(screen.getByLabelText('Nombre'), 'Camila')
  await user.type(screen.getByLabelText('Correo'), 'camila@correo.com')
  expect(submit()).toBeDisabled()
  await user.click(screen.getByLabelText('Acepto la política de datos.'))
  expect(submit()).toBeEnabled()
  await user.click(submit())
  expect(p.onSubmit).toHaveBeenCalledWith({ nombre: 'Camila', correo: 'camila@correo.com', celular: '', aceptaDatos: true, novedades: false })
})

// Falla si saltar el registro deja de ser posible, si el error del store no se muestra, o si mientras se crea se puede tocar dos veces.
it('always offers to continue without an account and shows errors and busy state', () => {
  const p = props({ error: 'Ese correo ya tiene cuenta.', busy: true })
  wrap(p)
  expect(screen.getByRole('alert')).toHaveTextContent('Ese correo ya tiene cuenta.')
  expect(screen.getByRole('button', { name: 'Creando tu cuenta…' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Seguir sin registrarme' }))
  expect(p.onSkip).toHaveBeenCalledTimes(1)
})
