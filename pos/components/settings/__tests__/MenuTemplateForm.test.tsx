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
  jest.mocked(gateway).mockImplementation((action: string) => Promise.resolve(action === 'get' ? ctx : action === 'preview' ? { borrador: 'borrador-pos', caduca: '2026-09-25T01:00:00Z' } : { codigo: 'S1' }) as never)
  jest.mocked(listTemplates).mockResolvedValue({ plantillas: [{ codigo: 'S1', tokens }], familias: {} } as never)
  jest.mocked(getBrand).mockResolvedValue({ companyId: 1, hasLogo: true, color: '#AA0000' } as never)
  jest.mocked(getBrandLogo).mockResolvedValue('existing-logo')
  jest.mocked(saveBrandLogo).mockResolvedValue(undefined)
  jest.mocked(saveBrandGreeting).mockResolvedValue(undefined)
})
// Falla si editar previsualiza con ajustes crudos, publica antes de guardar o deja de pasar por la pasarela.
it('shows one design, previews changes without saving and persists only the chosen branding', async () => {
  wrap()
  await screen.findByText('Tu restaurante, tu identidad')
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Botones y color principal · HEX'), { target: { value: '#145A52' } })
  fireEvent.change(screen.getByLabelText('Tipografía del menú'), { target: { value: 'DM Sans' } })
  await waitFor(() => {
    const url = screen.getByTitle('Vista previa del menú').getAttribute('src')!
    expect(url).toBe('http://diner/burger-house/poblado/carta?borrador=borrador-pos')
    expect(gateway).toHaveBeenCalledWith('preview', { plantilla: 'S1', paleta: { acento: '#145A52' }, tipografia: { display: 'DM Sans' } })
  })
  expect(screen.getByRole('link', { name: 'Sistema de diseño ↗' })).toHaveAttribute('href', 'http://diner/burger-house/poblado/design-system?borrador=borrador-pos')
  expect(gateway).not.toHaveBeenCalledWith('set', expect.anything())
  fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }))
  await waitFor(() => expect(gateway).toHaveBeenCalledWith('set', { plantilla: 'S1', paleta: { acento: '#145A52' }, tipografia: { display: 'DM Sans' } }))
  expect(saveBrandLogo).not.toHaveBeenCalled()
  expect(saveBrandGreeting).not.toHaveBeenCalled()
})
// Falla si permite guardar texto ilegible o borra la edición cuando falla el servidor.
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
// Falla si quitar el logo pisa ajustes ajenos o deja de usar el servicio de marca.
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

// Falla si un rechazo de validación se oculta tras una vista previa anterior aparentemente válida.
it('muestra el rechazo del borrador sin publicar los cambios', async () => {
  wrap(); await screen.findByTitle('Vista previa del menú')
  jest.mocked(gateway).mockRejectedValueOnce(new Error('Contraste insuficiente'))
  fireEvent.change(screen.getByLabelText('Botones y color principal · HEX'), { target: { value: '#234567' } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Contraste insuficiente')
  expect(screen.queryByTitle('Vista previa del menú')).not.toBeInTheDocument()
  expect(gateway).not.toHaveBeenCalledWith('set', expect.anything())
})
