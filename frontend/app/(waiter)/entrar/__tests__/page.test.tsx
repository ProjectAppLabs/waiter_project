import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import EnterWithPass from '@/app/(waiter)/entrar/page'
import { here, leaveTo } from '@/lib/domain/tenant'
import { messages } from '@/lib/i18n/messages'
import { CoreError } from '@/lib/services/core/http'
import { ShiftDeniedError, useAuthStore } from '@/lib/stores/authStore'
import { usePlatformStore } from '@/lib/stores/platformStore'

const replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }) }))
jest.mock('@/lib/domain/tenant', () => ({ ...jest.requireActual('@/lib/domain/tenant'), here: jest.fn(), leaveTo: jest.fn() }))

const enterPos = jest.fn()
const enterPlatform = jest.fn()
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><EnterWithPass /></NextIntlClientProvider>)
const open = (hash: string) => window.history.pushState({}, '', `/entrar${hash}`)

beforeEach(() => {
  replace.mockReset(); enterPos.mockReset().mockResolvedValue(undefined); enterPlatform.mockReset().mockResolvedValue(undefined)
  jest.mocked(leaveTo).mockReset()
  jest.mocked(here).mockReturnValue({ protocol: 'https:', host: 'frisby.waiter.projectapp.co' })
  useAuthStore.setState({ enterPass: enterPos })
  usePlatformStore.setState({ enterPass: enterPlatform })
})

// Falla si el pase no se cambia por la sesión del restaurante, si queda en la barra (y en el historial) o si después no
// se lleva a la persona a `/login`, que la manda a su pantalla o a elegir restaurante.
it('cambia el pase por la sesión del restaurante y lo quita de la dirección', async () => {
  open('#pase=pase-1&destino=pos')
  wrap()
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
  expect(enterPos).toHaveBeenCalledWith('pase-1')
  expect(enterPlatform).not.toHaveBeenCalled()
  expect(window.location.hash).toBe('')
  expect(window.location.pathname).toBe('/entrar')
})

// Falla si el pase de la consola se cambia como uno de restaurante o no lleva a la consola.
it('el pase de ProjectApp abre la consola', async () => {
  open('#pase=pase-2&destino=plataforma')
  wrap()
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/plataforma'))
  expect(enterPlatform).toHaveBeenCalledWith('pase-2')
  expect(enterPos).not.toHaveBeenCalled()
})

// Falla si un pase vencido o usado deja la pantalla en «Abriendo…» o no ofrece volver al inicio universal.
it.each([
  [new CoreError(401, 'invalid_pass', 'El ingreso venció o ya se usó. Vuelve a iniciar sesión.'), 'venció o ya se usó'],
  [new ShiftDeniedError('outside_hours', '14:00–22:00'), '14:00–22:00'],
  [new CoreError(0, 'unreachable', 'Sin red'), 'No se pudo abrir la sesión.'],
])('explica por qué no entró y vuelve al inicio universal', async (error, text) => {
  enterPos.mockRejectedValue(error)
  open('#pase=pase-3&destino=pos')
  wrap()
  expect(await screen.findByRole('alert')).toHaveTextContent(text)
  expect(replace).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Volver al inicio de sesión' }))
  expect(leaveTo).toHaveBeenCalledWith('https://waiter.projectapp.co/login')
})

// Falla si entrar a /entrar sin pase intenta abrir una sesión.
it('sin pase no intenta entrar', async () => {
  open('')
  wrap()
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo abrir la sesión.')
  expect(enterPos).not.toHaveBeenCalled()
})
