import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { NewOrganizationWizard } from '@/components/platform/NewOrganizationWizard'
import { OrganizationModulesPanel } from '@/components/platform/OrganizationModules'
import { OrganizationSheet } from '@/components/platform/OrganizationSheet'
import { messages } from '@/lib/i18n/messages'
import { coreFetch } from '@/lib/services/core/http'
import { updateOrganization, type OrganizationDetail, type PlatformUser } from '@/lib/services/core/platform'
import { usePlatformStore } from '@/lib/stores/platformStore'

// La frontera es el transporte: lo que llega a coreFetch es lo que recibe el servidor de la plataforma.
jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }), usePathname: () => '/plataforma' }))
const server = jest.mocked(coreFetch)
const book = { local_monthly: 150000, modules: {}, unit_prices: {}, on_exhausted: 'cobrar', recharge_packs: [],
  whatsapp_plans: [{ key: 'inicial', name: 'Inicial', monthly_price: 50000, included: { pedido_asistente: 100 } }] }
const person = (role: PlatformUser['role']) => ({ id: 'u1', name: 'Ana', username: 'ana', email: 'ana@projectapp.co', role })
const show = (ui: React.ReactElement) => render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>)
const sentBody = (call: number) => (server.mock.calls[call][1] as { body: Record<string, unknown> }).body
beforeEach(() => { server.mockReset(); usePlatformStore.setState({ user: person('admin'), hydrated: true }) })

// Llena la organización y el dueño y deja el asistente en el paso Plan con la lista de precios cargada.
async function toPlanStep() {
  server.mockResolvedValueOnce(book).mockResolvedValueOnce({ organization: { slug: 'frisby' } })
  show(<NewOrganizationWizard />)
  for (const [label, value] of [['Nombre de la organización', 'Frisby'], ['Razón social', 'Frisby SA'], ['NIT', '860.000.000-1'], ['Correo de facturación', 'pagos@frisby.co']]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  fireEvent.change(screen.getByLabelText('Nombre del dueño'), { target: { value: 'María López' } })
  fireEvent.change(screen.getByLabelText('Correo del dueño'), { target: { value: 'maria@frisby.co' } })
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Crear cliente e invitar al dueño' })).toBeEnabled())
}

// Falla si elegir un plan de WhatsApp sin precio propio manda `whatsapp: null`: el servidor lo rechaza con 400.
it('el alta con plan de WhatsApp no manda un precio propio vacío', async () => {
  await toPlanStep()
  fireEvent.click(screen.getByRole('radio', { name: /Personalizado/ }))
  fireEvent.change(screen.getByLabelText('Precio por local al mes (COP)'), { target: { value: '450000' } })
  fireEvent.change(screen.getByLabelText('Plan del asistente de WhatsApp'), { target: { value: 'inicial' } })
  fireEvent.click(screen.getByRole('button', { name: 'Crear cliente e invitar al dueño' }))
  await waitFor(() => expect(server).toHaveBeenCalledTimes(2))
  expect(server.mock.calls[1][0]).toBe('organizations')
  expect(sentBody(1).pricing).toEqual({ mode: 'personalizado', local_monthly: 450000, whatsapp_plan: 'inicial' })
})

// Falla si guardar la ficha con precios estándar y plan de WhatsApp manda `whatsapp: null` (400 del servidor).
it('la ficha guarda precios estándar sin un precio propio vacío', async () => {
  server.mockResolvedValueOnce({ organization: { slug: 'frisby' } })
  await updateOrganization('frisby', { monthly_price: 150000, pricing: { mode: 'estandar', whatsapp_plan: 'inicial', whatsapp: null } })
  expect(server).toHaveBeenCalledWith('organizations/frisby', {
    method: 'PATCH', scope: 'platform', body: { monthly_price: 150000, pricing: { mode: 'estandar', whatsapp_plan: 'inicial' } },
  })
})

// Falla si quien opera la plataforma manda precios al dar de alta un cliente: el servidor solo se los admite a quien
// administra y responde 403, aunque sin ellos el alta con precios estándar sí le está permitida.
it('quien opera da de alta un cliente con los precios estándar', async () => {
  usePlatformStore.setState({ user: person('operator') })
  await toPlanStep()
  expect(screen.queryByRole('group', { name: 'Precios del cliente' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Crear cliente e invitar al dueño' }))
  await waitFor(() => expect(server).toHaveBeenCalledTimes(2))
  expect(sentBody(1)).toMatchObject({ slug: 'frisby', plan: 'completo', owner: { name: 'María López', email: 'maria@frisby.co', username: 'maria.lopez' } })
  expect(sentBody(1)).not.toHaveProperty('pricing')
  expect(sentBody(1)).not.toHaveProperty('monthly_price')
})

const fidelizacion = (ends: string | null) => ({
  plan: 'completo', plans: [{ key: 'completo', name: 'Completo' }], restaurants: [],
  catalog: [{ key: 'fidelizacion', name: 'Fidelización', depends: [], units: [], required: false, available: true }],
  organization: [{ key: 'fidelizacion', active: true, source: 'organization', starts: null, ends, limits: null, price: null, notes: '' }],
})

// Falla si «Vence el» manda la fecha sola: el servidor exige un instante con zona horaria y responde 400. La vigencia
// incluye todo el día elegido.
it('la vigencia de un módulo viaja como el último instante del día con zona horaria', async () => {
  server.mockResolvedValueOnce(fidelizacion(null)).mockResolvedValueOnce(fidelizacion(null))
  show(<OrganizationModulesPanel slug="frisby" canEdit />)
  fireEvent.click(await screen.findByRole('button', { name: 'Vigencia y cupos' }))
  const dialog = screen.getByRole('dialog', { name: 'Fidelización · vigencia y cupos' })
  fireEvent.change(within(dialog).getByLabelText('Vence el'), { target: { value: '2026-12-31' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(server).toHaveBeenCalledTimes(2))
  expect(server.mock.calls[1][0]).toBe('organizations/frisby/modules')
  expect(sentBody(1).ends).toBe(new Date(2026, 11, 31, 23, 59, 59, 999).toISOString())
})

// Falla si editar solo el precio de un módulo cambia o pierde la vigencia que ya tenía guardada.
it('una vigencia guardada se muestra como fecha y no cambia al editar otro dato', async () => {
  const saved = new Date(2026, 11, 31, 23, 59, 59, 999).toISOString()
  server.mockResolvedValueOnce(fidelizacion(saved)).mockResolvedValueOnce(fidelizacion(saved))
  show(<OrganizationModulesPanel slug="frisby" canEdit />)
  fireEvent.click(await screen.findByRole('button', { name: 'Vigencia y cupos' }))
  const dialog = screen.getByRole('dialog', { name: 'Fidelización · vigencia y cupos' })
  expect(within(dialog).getByLabelText('Vence el')).toHaveValue('2026-12-31')
  fireEvent.change(within(dialog).getByLabelText('Precio especial ($)'), { target: { value: '20000' } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(server).toHaveBeenCalledTimes(2))
  expect(sentBody(1)).toMatchObject({ key: 'fidelizacion', ends: saved, price: 20000 })
})

const ficha: OrganizationDetail = {
  organization: { id: 'o1', slug: 'frisby', name: 'Frisby', legal_name: 'Frisby SA', tax_id: '860.000.000-1', billing_email: 'pagos@frisby.co',
    billing_contact: '', plan: 'completo', monthly_price: 150000, status: 'active', trial_ends: null, max_restaurants: 2, timezone: 'America/Bogota',
    suspended_at: null, suspended_reason: '', created_at: '2026-09-04T12:00:00Z', pricing: { mode: 'estandar', whatsapp_plan: null } },
  owner: { name: 'María López', email: 'maria@frisby.co', username: 'maria.lopez', status: 'active' }, restaurants: [], audit: [],
}
// Responde la ficha y la lista de precios; lo demás que pide la ficha (módulos, consumo, saldo, soporte) queda pendiente.
const replies: Record<string, unknown> = { 'organizations/frisby': ficha, 'settings/pricing': book }
const serveSheet = () => server.mockImplementation(async (path: string) => (path in replies ? replies[path] : new Promise(() => undefined)))
const patchBody = () => (server.mock.calls.find((call) => (call[1] as { method?: string } | undefined)?.method === 'PATCH')![1] as { body: Record<string, unknown> }).body
async function editSheet() {
  show(<OrganizationSheet slug="frisby" />)
  fireEvent.click(await screen.findByRole('button', { name: 'Editar plan y datos' }))
  return screen.getByRole('dialog', { name: 'Editar a Frisby' })
}

// Falla si «Editar plan y datos» manda precios cuando edita quien opera (el servidor responde 403 y no guarda nada), o
// si quien administra pierde la edición de precios de la ficha.
it('la ficha manda precios solo cuando la edita quien administra', async () => {
  serveSheet()
  usePlatformStore.setState({ user: person('operator') })
  const operator = await editSheet()
  expect(within(operator).queryByRole('group', { name: 'Precios del cliente' })).toBeNull()
  fireEvent.change(within(operator).getByLabelText('Límite de restaurantes'), { target: { value: '3' } })
  fireEvent.click(within(operator).getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(server).toHaveBeenCalledWith('organizations/frisby', expect.objectContaining({ method: 'PATCH' })))
  expect(Object.keys(patchBody()).sort()).toEqual(['billing_contact', 'billing_email', 'legal_name', 'max_restaurants', 'name', 'plan', 'tax_id', 'trial_ends'])
  expect(patchBody()).toMatchObject({ name: 'Frisby', max_restaurants: 3, trial_ends: null })
  cleanup(); server.mockClear()
  usePlatformStore.setState({ user: person('admin') })
  const admin = await editSheet()
  await within(admin).findByRole('option', { name: /Inicial/ })
  fireEvent.change(within(admin).getByLabelText('Plan del asistente de WhatsApp'), { target: { value: 'inicial' } })
  fireEvent.click(within(admin).getByRole('button', { name: 'Guardar' }))
  await waitFor(() => expect(server).toHaveBeenCalledWith('organizations/frisby', expect.objectContaining({ method: 'PATCH' })))
  expect(patchBody()).toMatchObject({ monthly_price: 150000 })
  expect(patchBody().pricing).toEqual({ mode: 'estandar', whatsapp_plan: 'inicial' })
})
