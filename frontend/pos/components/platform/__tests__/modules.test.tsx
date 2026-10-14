import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { OrganizationModulesPanel, OrganizationUsagePanel } from '@/components/platform/OrganizationModules'
import { CoreError } from '@/lib/services/core/http'
import { changeOrganizationModules, organizationModules, organizationUsage } from '@/lib/services/core/platform'

jest.mock('@/lib/services/core/platform', () => ({ organizationModules: jest.fn(), changeOrganizationModules: jest.fn(), organizationUsage: jest.fn() }))

const state = (key: string, active: boolean, source = 'plan') => ({ key, active, source, starts: null, ends: null, limits: null, price: null, notes: '' })
const data = {
  plan: 'completo', plans: [{ key: 'completo', name: 'Completo' }],
  catalog: [
    { key: 'nucleo', name: 'Núcleo', depends: [], units: [], required: true, available: true },
    { key: 'menu_comensal', name: 'Menú del comensal', depends: ['nucleo'], units: [], required: false, available: true },
    { key: 'asistente_menu', name: 'Asistente en el menú', depends: ['menu_comensal'], units: ['mensaje_ia'], required: false, available: true },
    { key: 'datafono', name: 'Datáfono integrado', depends: ['nucleo'], units: [], required: false, available: false },
  ],
  organization: [state('nucleo', true), state('menu_comensal', true), state('asistente_menu', false, 'organization'), state('datafono', false)],
  restaurants: [{ id: 7, name: 'Poblado', modules: [state('nucleo', true), state('menu_comensal', true), state('asistente_menu', true, 'restaurant'), state('datafono', false)] }],
}

beforeEach(() => { jest.mocked(organizationModules).mockResolvedValue(data as never); jest.mocked(changeOrganizationModules).mockReset() })

// Falla si la ficha no muestra de dónde sale cada módulo (plan, organización o local), si apagar o encender no manda el
// local correcto, si se puede tocar el núcleo o un módulo que todavía no existe, o si el error de dependencias no se ve
// con los módulos que dependen.
it('módulos por organización y por local, con su origen y sus dependencias', async () => {
  render(<OrganizationModulesPanel slug="burger-house" canEdit />)
  const table = await screen.findByRole('table', { name: 'Módulos por local' })
  const row = (name: string) => within(table).getAllByRole('row').find((r) => r.textContent?.includes(name))!
  expect(row('Asistente en el menú')).toHaveTextContent('Excepción de la organización')
  expect(row('Asistente en el menú')).toHaveTextContent('Excepción del local')
  expect(row('Núcleo')).toHaveTextContent('Siempre activo')
  expect(row('Datáfono integrado')).toHaveTextContent('Próximamente')
  fireEvent.click(within(row('Núcleo')).getAllByRole('switch')[0])
  fireEvent.click(within(row('Datáfono integrado')).getAllByRole('switch')[0])
  expect(changeOrganizationModules).not.toHaveBeenCalled()
  jest.mocked(changeOrganizationModules).mockResolvedValueOnce(data as never)
  fireEvent.click(within(row('Asistente en el menú')).getByRole('switch', { name: 'Asistente en el menú · Poblado' }))
  await waitFor(() => expect(changeOrganizationModules).toHaveBeenCalledWith('burger-house', { key: 'asistente_menu', active: false, restaurant_id: 7 }))
  jest.mocked(changeOrganizationModules).mockRejectedValueOnce(new CoreError(409, 'module_dependency', 'Otros módulos dependen de este.', { dependents: ['Asistente en el menú'] }))
  fireEvent.click(within(row('Menú del comensal')).getByRole('switch', { name: 'Menú del comensal · la organización' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Otros módulos dependen de este. (Asistente en el menú)')
  fireEvent.click(within(row('Asistente en el menú')).getAllByRole('button', { name: 'Quitar excepción' })[0])
  await waitFor(() => expect(changeOrganizationModules).toHaveBeenLastCalledWith('burger-house', { key: 'asistente_menu', restaurant_id: null, clear: true }))
})

// Falla si quien solo opera la plataforma puede cambiar módulos.
it('solo lectura para quien opera', async () => {
  render(<OrganizationModulesPanel slug="burger-house" canEdit={false} />)
  await screen.findByRole('table', { name: 'Módulos por local' })
  for (const s of screen.getAllByRole('switch')) fireEvent.click(s)
  expect(changeOrganizationModules).not.toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Quitar excepción' })).toBeNull()
  expect(screen.getByLabelText('Plan')).toBeDisabled()
})

// Falla si el consumo del cliente no se lee del mes elegido o no dice de qué local es cada consumo.
it('consumo del mes por local', async () => {
  jest.mocked(organizationUsage).mockImplementation(async (_slug, period) => ({ period, totals: [], rows: [{ module: 'facturacion', module_name: 'Facturación electrónica', unit: 'documento', unit_name: 'Documentos', quantity: 42, restaurant_id: 7, restaurant_name: 'Poblado' }] }))
  render(<OrganizationUsagePanel slug="burger-house" />)
  expect(await screen.findByRole('table', { name: 'Consumo' })).toHaveTextContent('Facturación electrónicaDocumentosPoblado42')
  fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2026-09' } })
  await waitFor(() => expect(organizationUsage).toHaveBeenLastCalledWith('burger-house', '2026-09'))
})
