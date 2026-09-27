import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NextIntlClientProvider } from 'next-intl'

import { MenuDecorationsForm } from '@/components/settings/MenuDecorationsForm'
import { messages } from '@/lib/i18n/messages'
import { addMenuDecoration, listMenuDecorations, removeMenuDecoration } from '@/lib/services/menuDecorations'

jest.mock('@/lib/services/menuDecorations', () => ({
  ...jest.requireActual('@/lib/services/menuDecorations'),
  listMenuDecorations: jest.fn(), addMenuDecoration: jest.fn(), removeMenuDecoration: jest.fn(),
}))
const LIST = { decoraciones: [], fabrica: [{ id: 'stars', nombre: 'Estrellas', archivo: '/smart-menu/stars.png' }], limites: { peso: 300000, lado: 1024, cantidad: 30 }, experienceUrl: 'http://192.168.1.13:8001' }
const HOJA = { id: 'hoja-de-menta', nombre: 'Hoja de menta', tipo: 'image/png', ancho: 64, alto: 64, peso: 1200, archivo: '/api/v1/burger-house/poblado/decoraciones/hoja-de-menta/?v=20260925', creada: '2026-09-25T20:00:00Z' }
const wrap = () => render(<NextIntlClientProvider locale="es" messages={messages}><MenuDecorationsForm /></NextIntlClientProvider>)
beforeEach(() => {
  jest.mocked(listMenuDecorations).mockResolvedValue(LIST)
  jest.mocked(addMenuDecoration).mockResolvedValue(HOJA)
  jest.mocked(removeMenuDecoration).mockResolvedValue({ eliminada: 'hoja-de-menta' })
})

// Falla si subir no manda la imagen como data URL por la pasarela, no muestra el id que usará la IA o deja pasar un tipo o peso fuera de límite.
it('sube una decoración como data URL y muestra su id', async () => {
  wrap()
  expect(await screen.findByText('Aún no hay decoraciones subidas. Las de fábrica siguen disponibles.')).toBeInTheDocument()
  expect(screen.getByText('stars')).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Nombre de la decoración'), 'Hoja de menta')
  const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'hoja.png', { type: 'image/png' })
  await userEvent.upload(screen.getByLabelText('Imagen PNG o WebP'), png)
  jest.mocked(listMenuDecorations).mockResolvedValue({ ...LIST, decoraciones: [HOJA] })
  await userEvent.click(screen.getByRole('button', { name: /Subir decoración/ }))
  await waitFor(() => expect(addMenuDecoration).toHaveBeenCalledWith('Hoja de menta', expect.stringMatching(/^data:image\/png;base64,/)))
  expect(await screen.findByText('Decoración subida. En las plantillas se usa como id «hoja-de-menta».')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: 'Hoja de menta' })).toHaveAttribute('src', 'http://192.168.1.13:8001/api/v1/burger-house/poblado/decoraciones/hoja-de-menta/?v=20260925')
  expect(screen.getByText('hoja-de-menta')).toBeInTheDocument()
  // Un SVG no pasa: podría ejecutar script si alguna vez se sirviera en línea.
  await userEvent.type(screen.getByLabelText('Nombre de la decoración'), 'Vector')
  await userEvent.upload(screen.getByLabelText('Imagen PNG o WebP'), new File(['<svg/>'], 'v.svg', { type: 'image/svg+xml' }), { applyAccept: false })
  await userEvent.click(screen.getByRole('button', { name: /Subir decoración/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Solo se admiten PNG o WebP.')
  expect(addMenuDecoration).toHaveBeenCalledTimes(1)
})

// Falla si eliminar no pide confirmación (las plantillas que usan la decoración vuelven a fábrica).
it('pide confirmación antes de eliminar', async () => {
  jest.mocked(listMenuDecorations).mockResolvedValue({ ...LIST, decoraciones: [HOJA] })
  wrap()
  await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))
  expect(removeMenuDecoration).not.toHaveBeenCalled()
  jest.mocked(listMenuDecorations).mockResolvedValue(LIST)
  await userEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }))
  expect(removeMenuDecoration).toHaveBeenCalledWith('hoja-de-menta')
  expect(await screen.findByText('Decoración «hoja-de-menta» eliminada. Las plantillas que la usaban vuelven a la de fábrica.')).toBeInTheDocument()
})
