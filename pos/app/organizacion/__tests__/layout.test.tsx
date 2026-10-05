import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import OrganizationLayout from '@/app/organizacion/layout'
import { messages } from '@/lib/i18n/messages'
import { useAuthStore } from '@/lib/stores/authStore'

const render = (ui: React.ReactElement) => rtlRender(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

const replace = jest.fn()
let pathname = '/organizacion'
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }), usePathname: () => pathname }))
jest.mock('@/lib/services/restaurants', () => ({ listRestaurants: jest.fn(async () => [{ id: 1, name: 'Centro' }]) }))
jest.mock('@/lib/services/settings', () => ({ getCompany: jest.fn(async () => ({ name: 'Burger House SAS' })) }))
jest.mock('@/components/organization/SubscriptionNotice', () => ({ SubscriptionNotice: () => null }))

const owner = { user: { uid: 1, name: 'Dueña', companyId: 1, role: 'owner' }, employee: { role: 'owner', name: 'Dueña' } }
function as(who: typeof owner | { user: object; employee: object }, modules: string[] | null) {
  useAuthStore.setState({ ...(who as Record<string, unknown>), hydrated: true, hydrate: jest.fn(async () => undefined), logout: jest.fn(async () => undefined), modules })
}
beforeEach(() => { jest.clearAllMocks(); pathname = '/organizacion' })

// Falla si alguien que no es el dueño (un encargado) ve la consola de la organización en vez de ir al inicio.
it('solo entra el dueño', async () => {
  as({ user: { uid: 2, name: 'Laura', companyId: 1, role: 'admin' }, employee: { role: 'admin', name: 'Laura' } }, null)
  const { container } = rtlRender(<OrganizationLayout><p>Contenido</p></OrganizationLayout>)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
  expect(container).toBeEmptyDOMElement()
})

// Falla si el menú muestra secciones de módulos apagados (inventario, fidelización) o pierde las del plan (plan W), o
// si no aparece el nombre de la empresa.
it('el menú solo trae lo del plan', async () => {
  as(owner, ['nucleo', 'salon', 'cocina'])
  render(<OrganizationLayout><p>Contenido</p></OrganizationLayout>)
  const nav = screen.getByRole('navigation', { name: 'Consola de la organización' })
  expect(within(nav).getByRole('link', { name: /Ventas/ })).toBeInTheDocument()
  expect(within(nav).getByRole('link', { name: /Historial de cambios/ })).toBeInTheDocument()
  expect(within(nav).queryByRole('link', { name: /Rentabilidad/ })).toBeNull()
  expect(within(nav).queryByRole('link', { name: /Clientes/ })).toBeNull()
  expect(await within(nav).findByText('Burger House SAS')).toBeInTheDocument()
})

// Falla si una dirección de un módulo apagado abre la pantalla en vez de explicar que no está en el plan, o si con el
// módulo activo no la abre.
it('por la dirección, un módulo apagado se explica', () => {
  pathname = '/organizacion/clientes'
  as(owner, ['nucleo'])
  const { unmount } = render(<OrganizationLayout><p>Lista de clientes</p></OrganizationLayout>)
  expect(screen.getByRole('alert')).toHaveTextContent('Esta función no está activa en tu plan')
  expect(screen.queryByText('Lista de clientes')).toBeNull()
  unmount()
  as(owner, ['nucleo', 'fidelizacion'])
  render(<OrganizationLayout><p>Lista de clientes</p></OrganizationLayout>)
  expect(screen.getByText('Lista de clientes')).toBeInTheDocument()
})
