import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { KitShell } from '@/components/kit/KitShell'
import messages from '@/lib/i18n/messages/es.json'
import { useAuthStore } from '@/lib/stores/authStore'

jest.mock('next/navigation', () => ({ usePathname: () => '/salon', useRouter: () => ({ replace: jest.fn() }) }))

// Falla si el armazón deja de mostrar la barra superior con la pestaña de la ruta actual (un mesero solo ve Mesas).
it('renders the top bar with the tab of the current path and the page content', () => {
  useAuthStore.setState({ user: { uid: 1, name: 'Ricardo Wilson', companyId: 1, role: 'waiter' }, session: null, hydrated: true })
  render(<NextIntlClientProvider locale="es" messages={messages}><KitShell><p>contenido</p></KitShell></NextIntlClientProvider>)
  expect(screen.getByRole('link', { name: 'Mesas' })).toHaveAttribute('aria-current', 'page')
  expect(screen.queryByRole('link', { name: 'Reservas' })).toBeNull()
  expect(screen.getByText('contenido')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Ricardo Wilson/ })).toBeInTheDocument()
})
