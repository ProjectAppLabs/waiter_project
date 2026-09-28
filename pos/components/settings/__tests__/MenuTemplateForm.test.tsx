import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { MenuTemplateForm } from '../MenuTemplateForm'
import messages from '@/lib/i18n/messages/es.json'
import { gateway, listTemplates } from '@/lib/services/menuTemplates'
import { getBrand, getBrandLogo, saveBrandGreeting, saveBrandLogo } from '@/lib/services/settings'

jest.mock('@/lib/services/menuTemplates', () => ({ ...jest.requireActual('@/lib/services/menuTemplates'), gateway: jest.fn(), listTemplates: jest.fn() }))
jest.mock('@/lib/domain/image', () => ({ ...jest.requireActual('@/lib/domain/image'), resizeImage: jest.fn().mockResolvedValue('bG9nbw==') }))
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
// Falla si editar previsualiza con ajustes crudos, publica antes de guardar, deja de pasar por la pasarela o vuelve a
// incrustar el menú en lugar de dar el enlace al menú de prueba.
it('shows one design, previews changes without saving and persists only the chosen branding', async () => {
  wrap()
  await screen.findByText('Tu restaurante, tu identidad')
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('Botones y color principal · HEX'), { target: { value: '#145A52' } })
  fireEvent.change(screen.getByLabelText('Tipografía del menú'), { target: { value: 'DM Sans' } })
  await waitFor(() => {
    const url = screen.getByRole('link', { name: 'Abrir menú de prueba ↗' }).getAttribute('href')!
    expect(url).toBe('http://diner/burger-house/poblado/carta?borrador=borrador-pos')
    expect(gateway).toHaveBeenCalledWith('preview', { plantilla: 'S1', paleta: { acento: '#145A52' }, tipografia: { display: 'DM Sans' } })
  })
  expect(screen.queryByTitle('Vista previa del menú')).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Abrir menú de prueba ↗' })).toHaveAttribute('target', '_blank')
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
// Falla si vuelve el campo de saludo (el menú ya saluda solo) o si soltar una imagen en la zona del logo no la carga.
it('sin saludo y con el logo por arrastrar y soltar', async () => {
  jest.mocked(getBrand).mockResolvedValue({ companyId: 1, hasLogo: false, color: '' } as never)
  jest.mocked(getBrandLogo).mockResolvedValue(null as never)
  wrap(); await screen.findByText('Tu restaurante, tu identidad')
  expect(screen.queryByText('Saludo del menú')).not.toBeInTheDocument()
  const zone = screen.getByText('Arrastra tu logo aquí o haz clic para elegirlo').closest('label')!
  fireEvent.dragOver(zone)
  expect(screen.getByText('Suelta la imagen aquí')).toBeInTheDocument()
  const file = new File(['logo'], 'logo.png', { type: 'image/png' })
  fireEvent.drop(zone, { dataTransfer: { files: [file] } })
  expect(await screen.findByRole('img', { name: 'Logo del restaurante' })).toHaveAttribute('src', expect.stringContaining('bG9nbw'))
  fireEvent.click(screen.getByRole('button', { name: /^Guardar$/ }))
  await waitFor(() => expect(saveBrandLogo).toHaveBeenCalledWith({ base64: 'bG9nbw==' }))
  expect(saveBrandGreeting).not.toHaveBeenCalled()
})

// Falla si un rechazo de validación se oculta tras una vista previa anterior aparentemente válida.
it('muestra el rechazo del borrador sin publicar los cambios', async () => {
  wrap(); await screen.findByRole('link', { name: 'Abrir menú de prueba ↗' })
  jest.mocked(gateway).mockRejectedValueOnce(new Error('Contraste insuficiente'))
  fireEvent.change(screen.getByLabelText('Botones y color principal · HEX'), { target: { value: '#234567' } })
  expect(await screen.findByRole('alert')).toHaveTextContent('Contraste insuficiente')
  expect(screen.queryByRole('link', { name: 'Abrir menú de prueba ↗' })).not.toBeInTheDocument()
  expect(gateway).not.toHaveBeenCalledWith('set', expect.anything())
})

// Falla si «Copiar enlace» no copia el enlace del menú de prueba o no confirma que lo copió.
it('copia el enlace del menú de prueba', async () => {
  const writeText = jest.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  wrap(); await screen.findByRole('link', { name: 'Abrir menú de prueba ↗' })
  fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('http://diner/burger-house/poblado/carta?borrador=borrador-pos'))
  expect(await screen.findByRole('button', { name: 'Enlace copiado' })).toBeInTheDocument()
})

// Falla si una fuente elegida por el sistema de diseño (fuera de la lista del POS) desaparece del selector o no se reenvía
// tal cual al preparar el menú de prueba.
it('conserva la fuente elegida en el sistema de diseño', async () => {
  jest.mocked(gateway).mockImplementation((action: string) => Promise.resolve(action === 'get' ? { ...ctx, ajustes: { plantilla: 'S1', paleta: {}, tipografia: { display: 'Anton' } } } : action === 'preview' ? { borrador: 'borrador-pos', caduca: '2026-09-25T01:00:00Z' } : { codigo: 'S1' }) as never)
  wrap(); await screen.findByRole('link', { name: 'Abrir menú de prueba ↗' })
  expect(screen.getByLabelText('Tipografía del menú')).toHaveValue('Anton')
  expect(screen.getByRole('option', { name: 'Anton · elegida en el sistema de diseño' })).toBeInTheDocument()
  expect(gateway).toHaveBeenCalledWith('preview', { plantilla: 'S1', paleta: {}, tipografia: { display: 'Anton' } })
})

// Falla si con un fondo oscuro y su propia tinta de fondo (tema v2) el formulario bloquea «Guardar» por comparar la tinta
// de las tarjetas con el fondo.
it('usa la tinta del fondo del tema para decidir si se lee', async () => {
  const ajustes = { plantilla: 'S1', paleta: { fondo: '#51141E', superficie: '#FCF7F2', tinta: '#240E10' }, tipografia: {}, tema: { fundamentos: { colores: { tintaFondo: '#FCF7F2' } } } }
  jest.mocked(gateway).mockImplementation((action: string) => Promise.resolve(action === 'get' ? { ...ctx, ajustes } : action === 'preview' ? { borrador: 'borrador-pos', caduca: '2026-09-25T01:00:00Z' } : { codigo: 'S1' }) as never)
  wrap(); await screen.findByText('Tu restaurante, tu identidad')
  expect(screen.queryByText(/El texto debe contrastar/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^Guardar$/ })).toBeEnabled()
})
