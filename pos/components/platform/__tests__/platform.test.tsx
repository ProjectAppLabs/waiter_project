import { fireEvent, render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { messages } from '@/lib/i18n/messages'

import { NewOrganizationWizard } from '@/components/platform/NewOrganizationWizard'
import { OrganizationSheet } from '@/components/platform/OrganizationSheet'
import { OrganizationsView } from '@/components/platform/OrganizationsView'
import { PlatformTeamView } from '@/components/platform/PlatformTeamView'
import { CoreError } from '@/lib/services/core/http'
import { createOrganization, getOrganization, invitePlatformUser, listOrganizations, listPlatformTeam, resendOwnerInvite, suspendOrganization, type Organization, type OrganizationDetail } from '@/lib/services/core/platform'
import { usePlatformStore } from '@/lib/stores/platformStore'

// El modal del kit traduce su botón de cerrar: hace falta el proveedor de textos.
const render = (ui: React.ReactElement) => rtlRender(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const push = jest.fn(), replace = jest.fn()
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace }), usePathname: () => '/plataforma' }))
jest.mock('@/lib/services/core/platform', () => ({
  listOrganizations: jest.fn(), createOrganization: jest.fn(), getOrganization: jest.fn(), updateOrganization: jest.fn(), suspendOrganization: jest.fn().mockResolvedValue({}),
  reactivateOrganization: jest.fn().mockResolvedValue({}), resendOwnerInvite: jest.fn().mockResolvedValue({ ok: true, sent: true }),
  listPlatformTeam: jest.fn(), invitePlatformUser: jest.fn(), deactivatePlatformUser: jest.fn(), resendPlatformInvite: jest.fn(),
  platformLogin: jest.fn(), platformLogout: jest.fn(), platformMe: jest.fn(),
}))

const org = (over: Partial<Organization> = {}): Organization => ({
  id: 'o1', slug: 'burger-house', name: 'Burger House', legal_name: 'Burger House SAS', tax_id: '900.123.456-7', billing_email: 'pagos@burger.co', billing_contact: 'Gustavo',
  plan: 'pro', monthly_price: 599000, status: 'active', trial_ends: null, max_restaurants: 3, timezone: 'America/Bogota', suspended_at: null, suspended_reason: '', created_at: '2026-09-04T12:00:00Z',
  owner: { name: 'Gustavo Pérez', email: 'gustavo@burger.co', username: 'gustavo.perez', status: 'active' }, restaurants_count: 2, ...over,
})
beforeEach(() => { jest.clearAllMocks(); usePlatformStore.setState({ user: { id: 'u1', name: 'Ana', username: 'ana', email: 'ana@projectapp.co', role: 'admin' }, hydrated: true }) })

// Falla si la lista de clientes no muestra dueño, plan, precio, restaurantes usados frente al límite y estado, o si el
// filtro «Dueño sin activar» no aísla a quien no ha activado su cuenta (plan T0).
it('lista los clientes con su dueño, plan y estado, y filtra', async () => {
  jest.mocked(listOrganizations).mockResolvedValue([org(), org({ id: 'o2', slug: 'frisby', name: 'Frisby', status: 'trial', trial_ends: '2026-11-01', restaurants_count: 0, max_restaurants: 1, owner: { name: 'Dueña Frisby', email: 'd@frisby.co', username: 'duena.frisby', status: 'pending' } })])
  render(<OrganizationsView />)
  const bh = await screen.findByRole('row', { name: /Burger House/ })
  expect(bh).toHaveTextContent('Gustavo Pérez')
  expect(bh).toHaveTextContent('$ 599.000')
  expect(bh).toHaveTextContent('2 / 3')
  expect(bh).toHaveTextContent('Activa')
  const frisby = screen.getByRole('row', { name: /Frisby/ })
  expect(frisby).toHaveTextContent('En prueba')
  expect(frisby).toHaveTextContent('hasta 2026-11-01')
  expect(frisby).toHaveTextContent('sin activar')
  fireEvent.click(screen.getByRole('button', { name: /Dueño sin activar/ }))
  expect(screen.queryByRole('row', { name: /Burger House/ })).toBeNull()
  fireEvent.click(within(screen.getByRole('row', { name: /Frisby/ })).getByRole('button', { name: 'Más acciones de Frisby' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Reenviar invitación al dueño' }))
  await waitFor(() => expect(resendOwnerInvite).toHaveBeenCalledWith('frisby'))
})

// Falla si el asistente deja pasar un slug inválido o reservado, si no propone la dirección y el usuario del dueño, o si
// no manda al sistema propio exactamente lo del contrato.
it('da de alta un cliente en tres pasos', async () => {
  jest.mocked(createOrganization).mockResolvedValue(org({ slug: 'frisby' }))
  render(<NewOrganizationWizard />)
  fireEvent.change(screen.getByLabelText('Nombre de la organización'), { target: { value: 'Frisby Antioquia' } })
  expect(screen.getByLabelText('Dirección (slug)')).toHaveValue('frisby-antioquia')
  fireEvent.change(screen.getByLabelText('Dirección (slug)'), { target: { value: 'plataforma' } })
  expect(screen.getByText('Ese nombre está reservado.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Dirección (slug)'), { target: { value: 'frisby' } })
  fireEvent.change(screen.getByLabelText('Razón social'), { target: { value: 'Frisby SA' } })
  fireEvent.change(screen.getByLabelText('NIT'), { target: { value: '860.000.000-1' } })
  fireEvent.change(screen.getByLabelText('Correo de facturación'), { target: { value: 'Pagos@Frisby.co' } })
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  fireEvent.change(screen.getByLabelText('Nombre del dueño'), { target: { value: 'María López' } })
  expect(screen.getByLabelText('Usuario')).toHaveValue('maria.lopez')
  fireEvent.change(screen.getByLabelText('Correo del dueño'), { target: { value: 'maria@frisby.co' } })
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  fireEvent.change(screen.getByLabelText('Precio mensual (COP)'), { target: { value: '450000' } })
  fireEvent.change(screen.getByLabelText('Límite de restaurantes'), { target: { value: '2' } })
  fireEvent.change(screen.getByLabelText('En prueba hasta (opcional)'), { target: { value: '2026-11-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Crear cliente e invitar al dueño' }))
  await waitFor(() => expect(createOrganization).toHaveBeenCalledWith({
    name: 'Frisby Antioquia', slug: 'frisby', legal_name: 'Frisby SA', tax_id: '860.000.000-1', billing_email: 'pagos@frisby.co', billing_contact: '',
    plan: 'basico', monthly_price: 450000, max_restaurants: 2, trial_ends: '2026-11-01', timezone: 'America/Bogota', owner: { name: 'María López', email: 'maria@frisby.co', username: 'maria.lopez' },
  }))
  expect(replace).toHaveBeenCalledWith('/plataforma/clientes/frisby?nuevo=1')
})

// Falla si un slug ya usado no se explica, en vez de un error genérico.
it('explica cuando la dirección ya existe', async () => {
  jest.mocked(createOrganization).mockRejectedValue(new CoreError(409, 'slug_taken', 'Ya existe.'))
  render(<NewOrganizationWizard />)
  for (const [label, value] of [['Nombre de la organización', 'Frisby'], ['Razón social', 'Frisby SA'], ['NIT', '1'], ['Correo de facturación', 'a@b.co']]) fireEvent.change(screen.getByLabelText(label), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  fireEvent.change(screen.getByLabelText('Nombre del dueño'), { target: { value: 'Ana Ruiz' } })
  fireEvent.change(screen.getByLabelText('Correo del dueño'), { target: { value: 'ana@frisby.co' } })
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  fireEvent.click(screen.getByRole('button', { name: 'Crear cliente e invitar al dueño' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un cliente con esa dirección')
})

// Falla si la ficha no muestra el estado del dueño, si suspender no pide confirmación, o si quien solo opera ve el botón
// de suspender.
it('la ficha suspende con confirmación y solo para quien administra', async () => {
  const detail: OrganizationDetail = { organization: org(), owner: org().owner!, restaurants: [{ id: 'r1', slug: 'poblado', name: 'Poblado' }], audit: [{ id: 'a1', action: 'organization.created', detail: {}, at: '2026-09-04T12:00:00Z', actor: { name: 'Ana' } }] }
  jest.mocked(getOrganization).mockResolvedValue(detail)
  const { unmount } = render(<OrganizationSheet slug="burger-house" />)
  expect(await screen.findByRole('heading', { name: 'Burger House' })).toBeInTheDocument()
  expect(screen.getByText('Poblado')).toBeInTheDocument()
  expect(screen.getByText('Cliente creado')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Suspender' }))
  expect(suspendOrganization).not.toHaveBeenCalled()
  fireEvent.click(within(screen.getByRole('dialog', { name: '¿Suspender a Burger House?' })).getByRole('button', { name: 'Suspender' }))
  await waitFor(() => expect(suspendOrganization).toHaveBeenCalledWith('burger-house', 'Suspendida desde la plataforma'))
  unmount()
  usePlatformStore.setState({ user: { id: 'u2', name: 'Op', username: 'op', email: 'op@projectapp.co', role: 'operator' } })
  render(<OrganizationSheet slug="burger-house" />)
  await screen.findByRole('heading', { name: 'Burger House' })
  expect(screen.queryByRole('button', { name: 'Suspender' })).toBeNull()
})

// Falla si invitar a alguien de ProjectApp no propone su usuario o no manda nombre, correo, usuario y rol.
it('invita a gente de ProjectApp', async () => {
  jest.mocked(listPlatformTeam).mockResolvedValue([{ id: 'u1', name: 'Ana', username: 'ana', email: 'ana@projectapp.co', role: 'admin', status: 'active' }])
  jest.mocked(invitePlatformUser).mockResolvedValue({ id: 'u3', name: 'Luis Gómez', username: 'luis.gomez', email: 'luis@projectapp.co', role: 'operator', status: 'pending' })
  render(<PlatformTeamView />)
  await screen.findByRole('row', { name: /Ana/ })
  fireEvent.click(screen.getByRole('button', { name: /Nueva persona/ }))
  const dialog = screen.getByRole('dialog', { name: 'Nueva persona de ProjectApp' })
  fireEvent.change(within(dialog).getByLabelText('Nombre'), { target: { value: 'Luis Gómez' } })
  expect(within(dialog).getByLabelText('Usuario')).toHaveValue('luis.gomez')
  fireEvent.change(within(dialog).getByLabelText('Correo'), { target: { value: 'luis@projectapp.co' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Invitar' }))
  await waitFor(() => expect(invitePlatformUser).toHaveBeenCalledWith({ name: 'Luis Gómez', email: 'luis@projectapp.co', username: 'luis.gomez', role: 'operator' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Invitamos a Luis Gómez')
})
