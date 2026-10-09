import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'

import { RestaurantInfoForm } from '@/components/settings/RestaurantInfoForm'
import { messages } from '@/lib/i18n/messages'
import { coreFetch } from '@/lib/services/core/http'

jest.mock('@/lib/services/core/http', () => ({ ...jest.requireActual('@/lib/services/core/http'), coreFetch: jest.fn() }))
const server = jest.mocked(coreFetch)
beforeEach(() => { server.mockReset(); server.mockResolvedValue({ restaurant: {} }) })

const local = { id: 2, name: 'Laureles', street: 'Calle 10', city: 'Medellín', phone: '3001234567', latitude: '', longitude: '', accessMargin: 30 }
const show = (initial = local) =>
  render(<NextIntlClientProvider locale="es" messages={messages}><RestaurantInfoForm initial={initial} /></NextIntlClientProvider>)
const paste = (value: string) => fireEvent.change(screen.getByLabelText('Enlace de Google Maps'), { target: { value } })

// Falla si la ubicación sacada del enlace de Maps viaja como texto: el servidor exige números y respondería 400.
it('guarda la ubicación del enlace de Maps como números', async () => {
  show()
  paste('https://www.google.com/maps/place/Laureles/@6.21,-75.57,17z/data=!3d6.2088!4d-75.5675')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Guardado.')
  expect(server).toHaveBeenCalledWith('restaurants/2', {
    method: 'PATCH', body: expect.objectContaining({ name: 'Laureles', latitude: 6.2088, longitude: -75.5675, access_margin_minutes: 30 }),
  })
})

// Falla si vaciar el enlace manda texto vacío (el servidor responde 400) en vez de borrar la ubicación con null.
it('borra la ubicación con null al vaciar el enlace', async () => {
  show({ ...local, latitude: '6.2088', longitude: '-75.5675' })
  paste('')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Guardado.')
  expect(server).toHaveBeenCalledWith('restaurants/2', { method: 'PATCH', body: expect.objectContaining({ latitude: null, longitude: null }) })
})
