import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import OrganizationLayout from '@/app/organizacion/layout'
import PlatformLayout from '@/app/plataforma/layout'
import { messages } from '@/lib/i18n/messages'

const mockReplace = jest.fn()
let mockPathname = '/organizacion'
const mockOrgState = {
  user: { role: 'owner' }, employee: { name: 'Dueña QA', role: 'owner' }, hydrated: true,
  hydrate: jest.fn(async () => undefined), logout: jest.fn(async () => undefined), modules: null as string[] | null,
}
const mockPlatformState = {
  user: { name: 'Operadora QA', role: 'operator', two_factor_required: false, two_factor: false }, hydrated: true,
  hydrate: jest.fn(async () => undefined), logout: jest.fn(async () => undefined),
}

jest.mock('next/navigation', () => ({ usePathname: () => mockPathname, useRouter: () => ({ replace: mockReplace }) }))
jest.mock('@/lib/stores/authStore', () => ({ useAuthStore: () => mockOrgState }))
jest.mock('@/lib/stores/platformStore', () => ({ usePlatformStore: () => mockPlatformState }))
jest.mock('@/lib/services/restaurants', () => ({ listRestaurants: jest.fn(async () => []) }))
jest.mock('@/lib/services/settings', () => ({ getCompany: jest.fn(async () => ({ name: 'Negocio QA' })) }))
jest.mock('@/components/organization/SubscriptionNotice', () => ({ SubscriptionNotice: () => null }))
jest.mock('@/components/kit/Aurora', () => ({ AuroraBackground: () => null }))

const wrap = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)

beforeEach(() => {
  jest.clearAllMocks()
  mockPathname = '/organizacion'
  mockOrgState.user.role = 'owner'
  mockOrgState.employee.role = 'owner'
  mockOrgState.modules = null
  mockPlatformState.user.role = 'operator'
  mockPlatformState.user.two_factor_required = false
  mockPlatformState.user.two_factor = false
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () {
    if (!this.open) return
    this.removeAttribute('open')
    this.dispatchEvent(new Event('close'))
  }
})

// Falla si el menú móvil muestra módulos desactivados o pierde las secciones disponibles para el dueño.
it('conserva el filtro de módulos en la navegación del dueño', async () => {
  mockOrgState.modules = ['nucleo']
  wrap(<OrganizationLayout><h1>Resumen QA</h1></OrganizationLayout>)
  await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
  const menu = within(screen.getByRole('dialog', { name: 'Consola de la organización' }))
  expect(menu.getByRole('link', { name: 'Resumen' })).toHaveAttribute('href', '/organizacion')
  expect(menu.getByRole('link', { name: 'Restaurantes' })).toHaveAttribute('href', '/organizacion/restaurantes')
  expect(menu.getByRole('link', { name: 'Equipo' })).toHaveAttribute('href', '/organizacion/equipo')
  for (const name of ['Clientes', 'Facturación', 'Diseño del menú', 'Rentabilidad']) expect(menu.queryByRole('link', { name })).toBeNull()
  expect(menu.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled()
})

// Falla si adaptar el layout permite a un encargado abrir la consola reservada al dueño.
it('mantiene la consola de la organización reservada al dueño', () => {
  mockOrgState.user.role = 'admin'
  mockOrgState.employee.role = 'admin'
  wrap(<OrganizationLayout><h1>Datos privados</h1></OrganizationLayout>)
  expect(mockReplace).toHaveBeenCalledWith('/login')
  expect(screen.queryByRole('button', { name: 'Abrir menú' })).toBeNull()
  expect(screen.queryByText('Datos privados')).toBeNull()
})

// Falla si el drawer permite abrir Clientes, Métricas o Cobros a una cuenta que debe configurar doble factor.
it('sólo ofrece Seguridad cuando el doble factor es obligatorio y falta activarlo', async () => {
  mockPathname = '/plataforma/seguridad'
  mockPlatformState.user.role = 'admin'
  mockPlatformState.user.two_factor_required = true
  wrap(<PlatformLayout><h1>Configura tu doble factor</h1></PlatformLayout>)
  await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
  const menu = within(screen.getByRole('dialog', { name: 'Consola de ProjectApp' }))
  expect(menu.getByRole('link', { name: 'Seguridad' })).toHaveAttribute('href', '/plataforma/seguridad')
  for (const name of ['Clientes', 'Métricas', 'Cobros', 'Precios', 'Equipo de ProjectApp']) expect(menu.queryByRole('link', { name })).toBeNull()
  expect(menu.getByRole('button', { name: 'Cerrar sesión' })).toBeEnabled()
})

// Falla si abrir directamente una sección protegida evita la redirección obligatoria a Seguridad.
it('redirige a Seguridad antes de mostrar una sección bloqueada por doble factor', () => {
  mockPathname = '/plataforma/metricas'
  mockPlatformState.user.role = 'admin'
  mockPlatformState.user.two_factor_required = true
  wrap(<PlatformLayout><h1>Métricas privadas</h1></PlatformLayout>)
  expect(mockReplace).toHaveBeenCalledWith('/plataforma/seguridad')
  expect(screen.queryByText('Métricas privadas')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Abrir menú' })).toBeNull()
})

// Falla si el menú de una cuenta habilitada pierde rutas de plataforma al cambiar de variante.
it('ofrece las seis secciones originales a una cuenta de plataforma habilitada', async () => {
  mockPathname = '/plataforma'
  wrap(<PlatformLayout><h1>Clientes QA</h1></PlatformLayout>)
  await userEvent.click(screen.getByRole('button', { name: 'Abrir menú' }))
  const menu = within(screen.getByRole('dialog', { name: 'Consola de ProjectApp' }))
  for (const [name, href] of [['Clientes', '/plataforma'], ['Métricas', '/plataforma/metricas'], ['Cobros', '/plataforma/cobros'],
    ['Precios', '/plataforma/precios'], ['Equipo de ProjectApp', '/plataforma/equipo'], ['Seguridad', '/plataforma/seguridad']]) {
    expect(menu.getByRole('link', { name })).toHaveAttribute('href', href)
  }
})
