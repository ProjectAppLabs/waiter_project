import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { MenuTemplateForm } from '../MenuTemplateForm'
import messages from '@/lib/i18n/messages/es.json'
import { gateway, listTemplates } from '@/lib/services/menuTemplates'
import { getBrand, getBrandLogo, saveBrandGreeting, saveBrandLogo } from '@/lib/services/settings'

jest.mock('@/lib/services/menuTemplates', () => ({ ...jest.requireActual('@/lib/services/menuTemplates'), gateway: jest.fn(), listTemplates: jest.fn() }))
jest.mock('@/lib/services/settings', () => ({ getBrand: jest.fn(), getBrandLogo: jest.fn(), saveBrandGreeting: jest.fn(), saveBrandLogo: jest.fn() }))
const tokens = { acento: '#6755A0', tintaTerciaria: '#FFB01D', fondo: '#F8F8FA', superficie: '#FFFFFF', tinta: '#32324D', displayFont: 'Mulish' }
const ctx = { restaurante: 'burger-house', sede: 'poblado', experienceUrl: 'http://experience', dinerUrl: 'http://diner', ajustes: { plantilla: 'S1', paleta: {}, tipografia: {} } }
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><MenuTemplateForm/></NextIntlClientProvider>)
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(gateway).mockImplementation((action: string) => Promise.resolve(action === 'get' ? ctx : { codigo: 'S1' }) as never)
  jest.mocked(listTemplates).mockResolvedValue({ plantillas: [{ codigo: 'S1', tokens }], familias: {} } as never)
  jest.mocked(getBrand).mockResolvedValue({ companyId: 1, hasLogo: true, color: '#AA0000' } as never)
  jest.mocked(getBrandLogo).mockResolvedValue('existing-logo')
  jest.mocked(saveBrandLogo).mockResolvedValue(undefined)
  jest.mocked(saveBrandGreeting).mockResolvedValue(undefined)
})
it('shows one design, previews changes without saving and persists only the chosen branding', async () => {
  wrap()
  await screen.findByText('Tu restaurante, tu identidad')
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Botones y color principal · HEX'), { target: { value: '#145A52' } })
  fireEvent.change(screen.getByLabelText('Tipografía del menú'), { target: { value: 'DM Sans' } })
  await waitFor(() => {
    const url = screen.getByTitle('Vista previa del menú').getAttribute('src')!
    const settings = JSON.parse(Buffer.from(url.split('vista_previa=')[1], 'base64url').toString())
    expect(settings).toEqual({ plantilla: 'S1', paleta: { acento: '#145A52' }, tipografia: { display: 'DM Sans' } })
  })
  expect(gateway).not.toHaveBeenCalledWith('set', expect.anything())
  fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }))
  await waitFor(() => expect(gateway).toHaveBeenCalledWith('set', { plantilla: 'S1', paleta: { acento: '#145A52' }, tipografia: { display: 'DM Sans' } }))
  expect(saveBrandLogo).not.toHaveBeenCalled()
  expect(saveBrandGreeting).not.toHaveBeenCalled()
})
it('blocks unreadable text on cards and preserves changes after a failed save', async () => {
  wrap(); await screen.findByText('Tu restaurante, tu identidad')
  fireEvent.change(screen.getByLabelText('Tarjetas · HEX'), { target: { value: '#32324D' } })
  expect(screen.getByRole('button', { name: /^Guardar$/ })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Tarjetas · HEX'), { target: { value: '#FFFFFF' } })
  jest.mocked(gateway).mockRejectedValueOnce(new Error('Sin conexión'))
  fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }))
  await screen.findByText('Sin conexión')
  expect(screen.getByLabelText('Tarjetas · HEX')).toHaveValue('#FFFFFF')
})
it('removes the logo through the brand service without overwriting its other settings', async () => {
  wrap(); await screen.findByText('Tu restaurante, tu identidad')
  fireEvent.click(screen.getByRole('button', { name: 'Quitar logo' }))
  fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }))
  await waitFor(() => expect(saveBrandLogo).toHaveBeenCalledWith({ remove: true }))
})
// Falla si el saludo de la cabecera del menú no se guarda desde Diseño del menú o si se escribe sin haberlo cambiado.
it('saves the menu greeting only when it changed', async () => {
  jest.mocked(getBrand).mockResolvedValue({ companyId: 1, hasLogo: false, color: '', greeting: 'Buenas noches' } as never)
  wrap(); await screen.findByText('Tu restaurante, tu identidad')
  expect(screen.getByPlaceholderText('Hola')).toHaveValue('Buenas noches')
  fireEvent.change(screen.getByPlaceholderText('Hola'), { target: { value: 'Qué gusto verte' } })
  expect(screen.getByText(/Qué gusto verte, Camila/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }))
  await waitFor(() => expect(saveBrandGreeting).toHaveBeenCalledWith('Qué gusto verte'))
})
