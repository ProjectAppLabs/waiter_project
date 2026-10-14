import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { Toaster } from '@/components/kit/Toaster'
import messages from '@/lib/i18n/messages/es.json'
import { toast, useToastStore } from '@/lib/stores/toastStore'

beforeEach(() => useToastStore.setState({ toasts: [] }))

// Falla si el toast deja de anunciarse (status) o si su ✕ deja de cerrarlo.
it('renders toasts as status messages and dismisses on close', async () => {
  render(<NextIntlClientProvider locale="es" messages={messages}><Toaster /></NextIntlClientProvider>)
  act(() => { toast({ title: '¡Pedido #DI001 enviado!', body: 'Va camino a cocina.' }) })
  expect(screen.getByRole('status')).toHaveTextContent('¡Pedido #DI001 enviado!')
  await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
  expect(screen.queryByRole('status')).toBeNull()
})
