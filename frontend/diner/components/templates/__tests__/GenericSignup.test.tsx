import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { GenericSignup } from '@/components/templates/generic/GenericSignup'
import type { SignupProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'

const props = (over: Partial<SignupProps> = {}): SignupProps => ({ template: DEFAULT_TEMPLATE, onSubmit: jest.fn(), onSkip: jest.fn(), busy: false, error: null, discountPct: 5, ...over })
const wrap = (p: SignupProps) => render(<NextIntlClientProvider locale="es" messages={messages}><GenericSignup {...p} /></NextIntlClientProvider>)
const submit = () => screen.getByRole('button', { name: 'Crear cuenta y aplicar 5%' })

// Falla si se puede crear la cuenta sin nombre, sin correo válido o sin aceptar la política; si novedades viene marcada por defecto (ley);
// o si el formulario no entrega exactamente los cinco campos del contrato.
it('enables the account only with name, valid email and the data policy, and submits the contract form', async () => {
  const user = userEvent.setup()
  const p = props()
  wrap(p)
  expect(screen.getByText('5%')).toBeInTheDocument()
  expect(submit()).toBeDisabled()
  await user.type(screen.getByLabelText('Nombre'), 'Camila Ruiz')
  await user.type(screen.getByLabelText('Correo'), 'camila@correo')
  await user.click(screen.getByLabelText('Acepto la política de datos.'))
  expect(submit()).toBeDisabled()
  await user.type(screen.getByLabelText('Correo'), '.com')
  expect(submit()).toBeEnabled()
  expect(screen.getByLabelText('Quiero novedades del restaurante.')).not.toBeChecked()
  await user.type(screen.getByLabelText('Celular'), '310 555 4821')
  await user.click(submit())
  expect(p.onSubmit).toHaveBeenCalledWith({ nombre: 'Camila Ruiz', correo: 'camila@correo.com', celular: '3105554821', aceptaDatos: true, novedades: false })
})

// Falla si saltar el registro deja de ser posible y visible, si el error del store no se muestra, o si mientras se crea se puede tocar dos veces.
it('always offers to continue without an account and shows errors and busy state', () => {
  const p = props({ error: 'Ese correo ya tiene cuenta.', busy: true })
  wrap(p)
  expect(screen.getByRole('alert')).toHaveTextContent('Ese correo ya tiene cuenta.')
  expect(screen.getByRole('button', { name: 'Creando tu cuenta…' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Seguir sin registrarme' }))
  expect(p.onSkip).toHaveBeenCalledTimes(1)
})
