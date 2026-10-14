import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { TopBar } from '@/components/kit/TopBar'
import messages from '@/lib/i18n/messages/es.json'

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

// Falla si la barra pierde una pestaña del kit, el punto de no leídas o el chip de usuario con rol.
it('renders kit tabs for the role, the bell with unread dot and the user chip', () => {
  wrap(<TopBar active="tables" role="waiter" userName="Ricardo Wilson" unread={2} onOpenSettings={() => undefined} />)
  expect(screen.getByRole('link', { name: 'Mesas' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Mesas' })).toHaveAttribute('href', '/salon')
  expect(screen.queryByRole('link', { name: 'Administración' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Notificaciones, 2 sin leer' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /Ricardo Wilson/ })).toHaveTextContent('Mesero')
})

// Falla si el admin pierde la fila de administración o el cajero ve chips que no le tocan.
it('shows the administration row with the subtabs of the role', () => {
  wrap(<TopBar active="admin" role="admin" userName="Ana" activeSubtab="settings" onOpenSettings={() => undefined} />)
  expect(screen.getByRole('link', { name: 'Configuración' })).toHaveAttribute('aria-current', 'page')
  // Plan Q: Facturación, Clientes y Retorno son de la consola del dueño; el Catálogo se edita desde Inventario.
  for (const name of ['Facturación', 'Clientes', 'Retorno', 'Catálogo']) expect(screen.queryByRole('link', { name })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Ventas' })).toBeInTheDocument()
})

// Falla si el Dashboard desaparece con la caja cerrada (sus informes no dependen de la caja), si Pedidos sigue ahí sin
// caja, o si «Abrir caja» no está en la barra con la caja cerrada (o aparece con la caja abierta).
it('keeps the dashboard with the register closed, hides orders and offers to open the register', () => {
  const { unmount } = wrap(<TopBar active="dashboard" role="admin" userName="Laura" administrationOnly onOpenSettings={() => undefined} />)
  expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard')
  expect(screen.queryByRole('link', { name: 'Pedidos' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Abrir caja' })).toHaveAttribute('href', '/caja')
  unmount()
  wrap(<TopBar active="dashboard" role="admin" userName="Laura" onOpenSettings={() => undefined} />)
  expect(screen.queryByRole('link', { name: 'Abrir caja' })).toBeNull()
})
