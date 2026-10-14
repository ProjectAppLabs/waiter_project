import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { PortadaSignup } from '@/components/templates/patterns/PortadaSignup'
import type { SignupProps } from '@/components/templates/types'
import { DEFAULT_TEMPLATE } from '@/lib/domain/template'
import messages from '@/lib/i18n/messages/es.json'

const mockState = { brand: 'La Provincia' as string | null }
jest.mock('@/lib/stores/dinerStore', () => ({ useDinerStore: (selector: (s: { entry: { contexto: { marca: { nombre: string } } } | null }) => unknown) => selector(mockState.brand ? { entry: { contexto: { marca: { nombre: mockState.brand } } } } : { entry: null }) }))

const props = (over: Partial<SignupProps> = {}): SignupProps => ({ template: DEFAULT_TEMPLATE, onSubmit: jest.fn(), onSkip: jest.fn(), busy: false, error: null, discountPct: 5, ...over })
const wrap = (p: SignupProps) => render(<NextIntlClientProvider locale="es" messages={messages}><PortadaSignup {...p} /></NextIntlClientProvider>)

beforeEach(() => { mockState.brand = 'La Provincia' })

// Falla si la portada pierde el porcentaje en el acento, el título con la marca o la frase; si pide nombre (dos campos, no tres); si deja
// crear sin aceptar la política; o si el nombre enviado no se deriva del correo (experience lo exige).
it('paints the cover with the brand, asks only email and phone and derives the name from the email', async () => {
  const user = userEvent.setup()
  const p = props()
  wrap(p)
  expect(screen.getByText('5%')).toHaveClass('text-t-acento')
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu primera vez en La Provincia')
  expect(screen.getByText('Déjanos tu correo y aplicamos el descuento ya.')).toBeInTheDocument()
  expect(screen.queryByLabelText('Nombre')).toBeNull()
  expect(screen.getByText('Sin contraseña: te enviamos un código cada vez que entres.')).toBeInTheDocument()
  const submit = screen.getByRole('button', { name: 'Crear cuenta y aplicar 5%' })
  await user.type(screen.getByLabelText('Correo'), 'camila.restrepo@correo.com')
  await user.type(screen.getByLabelText('Celular'), '310 555 4821')
  expect(submit).toBeDisabled()
  await user.click(screen.getByRole('checkbox', { name: 'Acepto la política de datos.' }))
  expect(submit).toBeEnabled()
  await user.click(submit)
  expect(p.onSubmit).toHaveBeenCalledWith({ nombre: 'Camila Restrepo', correo: 'camila.restrepo@correo.com', celular: '3105554821', aceptaDatos: true, novedades: false })
})

// Falla si «Ya tengo cuenta» no lleva al correo (mismo camino en experience) con su explicación, si «Seguir sin registrarme» no salta, si el
// error no se anuncia, o si sin marca el título no tiene alternativa.
it('explains the same-path login, offers skipping, shows errors and survives without a brand', () => {
  const p = props({ error: 'Ese correo no parece válido.' })
  wrap(p)
  fireEvent.click(screen.getByRole('button', { name: 'Ya tengo cuenta' }))
  expect(screen.getByLabelText('Correo')).toHaveFocus()
  expect(screen.getByRole('status')).toHaveTextContent('Escribe el mismo correo')
  expect(screen.getByRole('alert')).toHaveTextContent('Ese correo no parece válido.')
  fireEvent.click(screen.getByRole('button', { name: 'Seguir sin registrarme' }))
  expect(p.onSkip).toHaveBeenCalledTimes(1)
  mockState.brand = null
  wrap(props())
  expect(screen.getAllByRole('heading', { level: 1 })[1]).toHaveTextContent('Tu primera vez aquí')
})
