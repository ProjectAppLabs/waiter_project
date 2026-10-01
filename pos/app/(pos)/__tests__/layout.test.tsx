import { DEFAULT_ROLE_POLICY } from '@/lib/domain/permissions'
import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import PosLayout from '../layout'
import { useAuthStore } from '@/lib/stores/authStore'
import { useCatalogStore } from '@/lib/stores/catalogStore'
import { messages } from '@/lib/i18n/messages'

const replace = jest.fn()
let pathname = '/inventario'
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }), usePathname: () => pathname }))
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: jest.fn() }))
jest.mock('@/lib/stores/catalogStore', () => ({ useCatalogStore: jest.fn() }))
// La barra de navegación la pinta ahora el layout; estas pruebas miran quién entra a qué ruta, no la barra.
jest.mock('@/components/kit/KitShell', () => ({ KitShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }))
// La guardia de sesión tiene su propia prueba (lib/domain/__tests__/sessionGuard.test.ts).
jest.mock('@/components/account/SessionGuard', () => ({ SessionGuard: () => null }))
const load = jest.fn()
const auth = { user: { role: 'admin' }, employee: { role: 'admin' }, session: null, hydrated: true, hydrate: jest.fn() }
beforeEach(() => {
  jest.clearAllMocks()
  pathname = '/inventario'
  ;(useAuthStore as unknown as jest.Mock).mockReturnValue(auth)
  ;(useCatalogStore as unknown as jest.Mock).mockImplementation((select) => select({ load, status: 'ready', error: null, catalog: { settings: { rolePermissions: DEFAULT_ROLE_POLICY } } }))
})
it('allows administrator inventory access with cash closed', () => {
  render(<PosLayout><p>Inventario editable</p></PosLayout>)
  expect(screen.getByText('Inventario editable')).toBeInTheDocument()
  expect(load).toHaveBeenCalledWith(null)
  expect(replace).not.toHaveBeenCalled()
})
it('requires cash for operations even for administrators', () => {
  pathname = '/pedidos/nuevo'
  render(<PosLayout><p>Crear pedido</p></PosLayout>)
  expect(screen.queryByText('Crear pedido')).toBeNull()
  expect(replace).toHaveBeenCalledWith('/caja')
})
it.each(['waiter', 'cashier'])('does not grant closed-cash administration to a %s PIN on an admin terminal', (role) => {
  ;(useAuthStore as unknown as jest.Mock).mockReturnValue({ ...auth, employee: { role } })
  render(<PosLayout><p>Inventario editable</p></PosLayout>)
  expect(screen.queryByText('Inventario editable')).toBeNull()
  expect(replace).toHaveBeenCalledWith('/caja')
})

// Falla si la barra deja de envolver las pantallas normales o aparece en las de pantalla completa (la cocina): ahora la
// pone el layout, una sola vez, para que persista al cambiar de pantalla.
it('wraps regular screens in the navigation bar and leaves full-screen ones bare', () => {
  ;(useAuthStore as unknown as jest.Mock).mockReturnValue({ ...auth, session: { id: 1, configId: 1 } })
  const { unmount } = render(<PosLayout><p>Pedidos</p></PosLayout>)
  expect(screen.getByTestId('shell')).toContainElement(screen.getByText('Pedidos'))
  unmount()
  pathname = '/kds'
  render(<PosLayout><p>Cocina</p></PosLayout>)
  expect(screen.getByText('Cocina')).toBeInTheDocument()
  expect(screen.queryByTestId('shell')).not.toBeInTheDocument()
})

// Falla si al abrir o recargar la app vuelve a verse una pantalla en blanco mientras se recupera la sesión.
it('shows the app frame skeleton while it restores the session', () => {
  ;(useAuthStore as unknown as jest.Mock).mockReturnValue({ ...auth, hydrated: false })
  const { container } = render(<NextIntlClientProvider locale="es" messages={messages}><PosLayout><p>Inventario editable</p></PosLayout></NextIntlClientProvider>)
  expect(screen.getByRole('status')).toHaveTextContent('Cargando')
  expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(3)
  expect(screen.queryByText('Inventario editable')).not.toBeInTheDocument()
})
