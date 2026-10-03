import { act, fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import SupportEntry from '@/app/soporte/page'
import PlatformLayout from '@/app/plataforma/layout'
import { AuditView } from '@/components/business/AuditView'
import { SupportView } from '@/components/business/SupportView'
import { TeamHoursView } from '@/components/business/TeamHoursView'
import { OrganizationSupportPanel } from '@/components/platform/OrganizationSupport'
import { SecurityView } from '@/components/platform/SecurityView'
import { SupportBanner } from '@/components/support/SupportBanner'
import { messages } from '@/lib/i18n/messages'
import { listAudit, auditActions, type AuditEntry } from '@/lib/services/core/audit'
import { toCorePerson, toPerson } from '@/lib/services/core/bridge'
import { downloadExport } from '@/lib/services/core/exports'
import { enable2fa, setup2fa } from '@/lib/services/core/platform'
import { approveSupport, grantSupport, listSupport, organizationSupport, requestSupport, revokeSupport, supportEntryUrl, type SupportGrant } from '@/lib/services/core/support'
import { teamReport } from '@/lib/services/core/teamReport'
import { useAuthStore } from '@/lib/stores/authStore'
import { usePlatformStore } from '@/lib/stores/platformStore'

const render = (ui: React.ReactElement) => rtlRender(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const replace = jest.fn()
let pathname = '/plataforma'
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: jest.fn() }), usePathname: () => pathname }))
jest.mock('@/lib/services/core/audit', () => ({ listAudit: jest.fn(), auditActions: jest.fn() }))
jest.mock('@/lib/services/core/pos', () => ({ ...jest.requireActual('@/lib/services/core/pos'), listPeople: jest.fn(async () => [{ id: '7', name: 'Sofía', username: 'sofia', email: null, role: 'cashier', restaurant_ids: [], shift: null, status: 'active' }]) }))
jest.mock('@/lib/services/core/exports', () => ({ downloadExport: jest.fn(async (kind: string) => `${kind}.csv`) }))
jest.mock('@/lib/services/core/teamReport', () => ({ teamReport: jest.fn() }))
jest.mock('@/lib/services/core/support', () => ({
  ...jest.requireActual('@/lib/services/core/support'),
  listSupport: jest.fn(), grantSupport: jest.fn(), approveSupport: jest.fn(), revokeSupport: jest.fn(), enterSupport: jest.fn(),
  organizationSupport: jest.fn(), requestSupport: jest.fn(), supportEntryUrl: jest.fn(),
}))
jest.mock('@/lib/services/core/platform', () => ({
  ...jest.requireActual('@/lib/services/core/platform'),
  setup2fa: jest.fn(), enable2fa: jest.fn(), disable2fa: jest.fn(), platformMe: jest.fn(), platformLogout: jest.fn(),
}))

const entry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  id: 1, at: '2026-10-02T15:30:00Z', restaurant: { id: 1, name: 'Centro' }, actor: { kind: 'account', id: 7, name: 'Sofía' },
  action: 'product.price', action_name: 'Cambio de precio', entity: 'product', entity_id: 12, summary: 'Hamburguesa: $ 20.000 → $ 22.000',
  before: { precio: 20000 }, after: { precio: 22000 }, ...over,
})
const grant = (over: Partial<SupportGrant> = {}): SupportGrant => ({
  id: 3, state: 'pedido', reason: 'Revisar el cierre de ayer', hours: 24, starts_at: null, ends_at: null, created_at: '2026-10-03T12:00:00Z',
  requested_by: { name: 'Ana · ProjectApp' }, approved_by: null, ...over,
})

beforeEach(() => {
  jest.clearAllMocks(); pathname = '/plataforma'
  useAuthStore.setState({ support: null })
  jest.mocked(auditActions).mockResolvedValue([{ key: 'product.price', name: 'Cambio de precio' }, { key: 'order.void', name: 'Pedido anulado' }])
})

// Falla si el historial no dice quién, cuándo y qué cambió, si no marca lo que hizo ProjectApp, si el detalle no muestra
// antes y después, o si los filtros no llegan al servidor y al CSV (plan Y2).
it('el historial de cambios muestra quién, qué y el antes y después, y filtra', async () => {
  jest.mocked(listAudit).mockResolvedValue({ entries: [entry(), entry({ id: 2, actor: { kind: 'platform', id: 'u1', name: 'ProjectApp · Ana (soporte)' }, action: 'modules.change', action_name: 'Módulos', summary: 'Activó inventario', restaurant: null, before: null, after: { inventario: true } })], total: 2 })
  render(<AuditView restaurants={[{ id: 1, name: 'Centro' }, { id: 2, name: 'Norte' }]} />)
  const row = await screen.findByRole('row', { name: /Hamburguesa/ })
  expect(row).toHaveTextContent('Sofía'); expect(row).toHaveTextContent('Centro'); expect(row).toHaveTextContent('Cambio de precio')
  const platformRow = screen.getByRole('row', { name: /Activó inventario/ })
  expect(platformRow).toHaveTextContent('ProjectApp'); expect(platformRow).toHaveTextContent('Organización')
  fireEvent.click(row)
  const diff = await screen.findByRole('table', { name: 'Antes y después' })
  expect(within(diff).getByRole('row', { name: /precio/ })).toHaveTextContent(/20000.*22000/)
  fireEvent.click(screen.getByRole('button', { name: /Cerrar/ }))
  fireEvent.change(await screen.findByLabelText('Tipo de cambio'), { target: { value: 'order.void' } })
  fireEvent.click(screen.getByRole('button', { name: 'Norte' }))
  await waitFor(() => expect(listAudit).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'order.void', restaurant_id: 2, offset: 0 })))
  fireEvent.click(screen.getByRole('button', { name: /Exportar CSV/ }))
  await waitFor(() => expect(downloadExport).toHaveBeenCalledWith('historial', expect.objectContaining({ action: 'order.void', restaurant_id: 2 })))
})

// Falla si las horas, propinas o el pago estimado de cada persona no se ven, si falta la fila de totales, o si cambiar
// de local no vuelve a pedir el informe con ese local (plan Y5).
it('horas y propinas por persona con su pago estimado', async () => {
  jest.mocked(teamReport).mockResolvedValue({
    rows: [{ account: { id: 7, name: 'Sofía', role: 'waiter' }, hours: 40.5, shifts: 5, orders: 61, sales: 2400000, tips: 180000, hourly_rate: 8000, estimated_pay: 504000 },
      { account: { id: 8, name: 'Luis', role: 'cashier' }, hours: 10, shifts: 2, orders: 0, sales: 0, tips: 0, hourly_rate: null, estimated_pay: null }],
    totals: { hours: 50.5, shifts: 7, orders: 61, sales: 2400000, tips: 180000, estimated_pay: 504000 },
  })
  render(<TeamHoursView restaurants={[{ id: 1, name: 'Centro' }, { id: 2, name: 'Norte' }]} />)
  const sofia = await screen.findByRole('row', { name: /Sofía/ })
  expect(sofia).toHaveTextContent('40,5'); expect(sofia).toHaveTextContent('Mesero')
  expect(sofia.textContent?.replace(/\s/g, ' ')).toMatch(/180\.000.*8\.000.*504\.000/)
  expect(screen.getByRole('row', { name: /Luis/ })).toHaveTextContent('Sin definir')
  expect(screen.getByRole('row', { name: /Total/ })).toHaveTextContent('50,5')
  fireEvent.click(screen.getByRole('button', { name: 'Norte' }))
  await waitFor(() => expect(teamReport).toHaveBeenLastCalledWith(expect.objectContaining({ restaurant_id: 2 })))
})

// Falla si el dueño no puede dar, aprobar o quitar el acceso de soporte, o si una sesión de soporte ve los botones para
// darse más acceso a sí misma (plan Y4).
it('el dueño da, aprueba y quita el acceso de soporte', async () => {
  jest.mocked(listSupport).mockResolvedValue([grant(), grant({ id: 4, state: 'vigente', reason: 'Ajustar la impresora', starts_at: '2026-10-03T10:00:00Z', ends_at: '2026-10-04T10:00:00Z', approved_by: { name: 'Gustavo' } })])
  jest.mocked(grantSupport).mockResolvedValue(grant({ id: 5, state: 'vigente' }))
  jest.mocked(approveSupport).mockResolvedValue(grant({ state: 'vigente' }))
  jest.mocked(revokeSupport).mockResolvedValue(grant({ id: 4, state: 'revocado' }))
  const view = render(<SupportView />)
  expect(await screen.findByRole('row', { name: /Revisar el cierre/ })).toHaveTextContent('Pedido, sin aprobar')
  fireEvent.change(screen.getByLabelText(/Horas/), { target: { value: '8' } })
  fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Configurar la impresora' } })
  fireEvent.click(screen.getByRole('button', { name: 'Dar acceso' }))
  await waitFor(() => expect(grantSupport).toHaveBeenCalledWith(8, 'Configurar la impresora'))
  fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }))
  await waitFor(() => expect(approveSupport).toHaveBeenCalledWith(3))
  fireEvent.click(await screen.findByRole('button', { name: 'Quitar' }))
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Quitar' }))
  await waitFor(() => expect(revokeSupport).toHaveBeenCalledWith(4))
  view.unmount()
  act(() => useAuthStore.setState({ support: { until: '2026-10-04T10:00:00Z', agent: 'Ana' } }))
  render(<SupportView />)
  await screen.findByRole('row', { name: /Ajustar la impresora/ })
  expect(screen.queryByRole('button', { name: 'Dar acceso' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
})

// Falla si una sesión de soporte no se distingue en pantalla (quién, hasta qué hora) o si «Salir» no la cierra.
it('la franja de soporte dice quién y hasta cuándo, y sale', async () => {
  const logout = jest.fn(async () => undefined)
  useAuthStore.setState({ support: { until: '2026-10-04T15:30:00Z', agent: 'Ana' }, logout })
  render(<SupportBanner />)
  const strip = screen.getByRole('status', { name: 'Sesión de soporte' })
  expect(strip).toHaveTextContent(/Sesión de soporte de ProjectApp · Ana · termina a las/)
  fireEvent.click(within(strip).getByRole('button', { name: 'Salir' }))
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'))
  expect(logout).toHaveBeenCalled()
})

// Falla si /soporte no cambia el token por la sesión, si deja el token en la dirección o si un token malo no se explica.
it('la entrada de soporte cambia el token y lo quita de la dirección', async () => {
  const enterSupport = jest.fn(async () => undefined)
  useAuthStore.setState({ enterSupport })
  window.history.replaceState(null, '', '/soporte?token=abc123')
  render(<SupportEntry />)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/organizacion'))
  expect(enterSupport).toHaveBeenCalledWith('abc123')
  expect(window.location.search).toBe('')
})

it('un token de soporte que ya no sirve se explica', async () => {
  // Falla si un token usado o vencido deja la pantalla en «Abriendo la sesión…» sin decir qué pasó.
  const { CoreError } = jest.requireActual('@/lib/services/core/http')
  useAuthStore.setState({ enterSupport: jest.fn(async () => { throw new CoreError(400, 'invalid_token', 'El enlace ya se usó o venció.') }) })
  window.history.replaceState(null, '', '/soporte?token=usado')
  render(<SupportEntry />)
  expect(await screen.findByRole('alert')).toHaveTextContent('El enlace ya se usó o venció.')
  expect(replace).not.toHaveBeenCalledWith('/organizacion')
})

// Falla si ProjectApp puede entrar sin acceso vigente desde la ficha, si pedirlo no manda motivo y horas, o si «Entrar
// como soporte» no abre el enlace de un solo uso.
it('la ficha del cliente pide acceso y entra solo con uno vigente', async () => {
  jest.mocked(organizationSupport).mockResolvedValueOnce([]).mockResolvedValue([grant({ state: 'vigente', ends_at: '2026-10-04T10:00:00Z', approved_by: { name: 'Gustavo' } })])
  jest.mocked(requestSupport).mockResolvedValue(grant())
  jest.mocked(supportEntryUrl).mockResolvedValue('https://burger-house.waiter.co/soporte?token=t1')
  const tab = { location: { href: '' }, close: jest.fn() }
  jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window)
  render(<OrganizationSupportPanel slug="burger-house" />)
  expect(await screen.findByRole('button', { name: 'Pedir acceso' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: 'Entrar como soporte' })).toBeNull()
  fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'No le imprime la comanda' } })
  fireEvent.click(screen.getByRole('button', { name: 'Pedir acceso' }))
  await waitFor(() => expect(requestSupport).toHaveBeenCalledWith('burger-house', 'No le imprime la comanda', 24))
  fireEvent.click(await screen.findByRole('button', { name: 'Entrar como soporte' }))
  await waitFor(() => expect(tab.location.href).toBe('https://burger-house.waiter.co/soporte?token=t1'))
})

// Falla si activar el doble factor no muestra el QR y la clave, no manda el código, o no muestra los códigos de respaldo
// una vez (plan Y3).
it('activa el doble factor con el QR y muestra los códigos de respaldo', async () => {
  usePlatformStore.setState({ user: { id: 'u1', name: 'Ana', username: 'ana', email: 'ana@projectapp.co', role: 'admin', two_factor: false, two_factor_required: true }, hydrated: true, hydrate: jest.fn(async () => undefined) })
  jest.mocked(setup2fa).mockResolvedValue({ secret: 'JBSWY3DPEHPK3PXP', otpauth_uri: 'otpauth://totp/x', qr: 'data:image/svg+xml;base64,PHN2Zy8+' })
  jest.mocked(enable2fa).mockResolvedValue({ recovery_codes: ['aaaa-1111', 'bbbb-2222'] })
  render(<SecurityView />)
  expect(screen.getByRole('alert')).toHaveTextContent('debe tener doble factor')
  fireEvent.click(screen.getByRole('button', { name: 'Activar doble factor' }))
  expect(await screen.findByRole('img', { name: /QR/ })).toHaveAttribute('src', 'data:image/svg+xml;base64,PHN2Zy8+')
  expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Código de la app'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Activar' }))
  const codes = await screen.findByRole('region', { name: 'Códigos de respaldo' })
  expect(codes).toHaveTextContent('aaaa-1111'); expect(codes).toHaveTextContent('bbbb-2222')
  expect(enable2fa).toHaveBeenCalledWith('123456')
})

// Falla si quien debe tener doble factor y no lo tiene puede abrir otras secciones de la consola de ProjectApp.
it('sin el doble factor exigido la consola solo abre Seguridad', async () => {
  usePlatformStore.setState({ user: { id: 'u1', name: 'Ana', username: 'ana', email: 'ana@projectapp.co', role: 'admin', two_factor: false, two_factor_required: true }, hydrated: true, hydrate: jest.fn(async () => undefined) })
  const first = render(<PlatformLayout><p>Clientes</p></PlatformLayout>)
  await waitFor(() => expect(replace).toHaveBeenCalledWith('/plataforma/seguridad'))
  expect(screen.queryByText('Clientes')).toBeNull()
  first.unmount()
  pathname = '/plataforma/seguridad'
  render(<PlatformLayout><p>Contenido de seguridad</p></PlatformLayout>)
  const nav = screen.getByRole('navigation', { name: 'Consola de ProjectApp' })
  expect(within(nav).queryByRole('link', { name: /Clientes/ })).toBeNull()
  expect(within(nav).getByRole('link', { name: /Seguridad/ })).toBeInTheDocument()
})

// Falla si el valor de la hora no viaja al servidor al editar a una persona o si el que llega como texto decimal no se
// lee como número (plan Y5).
it('el valor de la hora va y vuelve del servidor', () => {
  expect(toCorePerson({ hourlyRate: 8500 })).toEqual({ hourly_rate: 8500 })
  expect(toCorePerson({ hourlyRate: null })).toEqual({ hourly_rate: null })
  const base = { id: '7', name: 'Sofía', username: 'sofia', email: null, role: 'waiter' as const, restaurant_ids: [], shift: null, status: 'active' as const }
  expect(toPerson({ ...base, hourly_rate: '8500.00' }).hourlyRate).toBe(8500)
  expect(toPerson(base).hourlyRate).toBeNull()
})
